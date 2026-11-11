const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

const STONE_BOX = 1.44;
const padFor = (width) => Math.max(12, Math.min(width * 0.052, 40));

/** 棋盘绘制与命中检测。所有尺寸以 CSS 像素计算，绘制时按设备像素比缩放。 */
export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.game = null;
    this.hover = null;
    this.hint = null;
    this.cursor = null;
    this.motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.size = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.geometry = { x0: 0, y0: 0, cell: 0, pad: 0 };
    this.surface = null;
    this.sprites = null;
    this.spriteCell = 0;

    this.raf = 0;
    this.lastAnim = null;
    this.winAnim = null;
    this.hintAnimUntil = 0;
    this.prevCount = 0;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.round(rect.width * 100) / 100;
    const height = Math.round(rect.height * 100) / 100;
    if (width === this.width && height === this.height && dpr === this.dpr) return;

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = padFor(width);
    const cell = (width - pad * 2) / (this.size ? this.size - 1 : 14);
    this.geometry = { x0: pad, y0: pad, cell, pad };

    this.surface = null;
    this.spriteCell = 0;
    if (this.game) {
      this.buildSurface();
      this.buildSprites();
    }
    this.requestDraw();
  }

  setGame(game) {
    const prevCount = this.game ? this.game.history.length : 0;
    const sizeChanged = !this.game || this.game.size !== game.size || this.size !== game.size;
    this.game = game;
    this.size = game.size;

    if (sizeChanged) {
      const pad = padFor(this.width);
      const cell = (this.width - pad * 2) / (this.size - 1);
      this.geometry = { x0: pad, y0: pad, cell, pad };
      this.surface = null;
      this.spriteCell = 0;
    }

    if (this.motion && game.history.length === prevCount + 1) {
      const move = game.lastMove;
      this.lastAnim = {
        index: move.y * game.size + move.x,
        start: performance.now(),
      };
    } else {
      this.lastAnim = null;
    }

    this.winAnim = this.motion && game.winLine ? performance.now() : null;

    if (!this.surface) this.buildSurface();
    if (!this.sprites) this.buildSprites();
    this.prevCount = game.history.length;
    this.requestDraw();
  }

  setHover(cell) {
    const same =
      (cell === null && this.hover === null) ||
      (cell && this.hover && cell.x === this.hover.x && cell.y === this.hover.y);
    if (same) return;
    this.hover = cell;
    this.requestDraw();
  }

  setHint(cell) {
    const same =
      (cell === null && this.hint === null) ||
      (cell && this.hint && cell.x === this.hint.x && cell.y === this.hint.y);
    if (same) return;
    this.hint = cell;
    // 只呼吸约 2.4 秒，之后保持静态高亮，避免整盘 60fps 无限重绘。
    this.hintAnimUntil = cell && this.motion ? performance.now() + 2400 : 0;
    this.requestDraw();
  }

  setCursor(cell) {
    const same =
      (cell === null && this.cursor === null) ||
      (cell && this.cursor && cell.x === this.cursor.x && cell.y === this.cursor.y);
    if (same) return;
    this.cursor = cell;
    this.requestDraw();
  }

  drawMagnifier(target, cell) {
    if (!target || !this.game || !this.width) return;
    const ctx = target.getContext("2d");
    if (!ctx) return;

    const { x0, y0, cell: step } = this.geometry;
    const radius = Math.max(step * 2.6, 44);
    const cx = x0 + cell.x * step;
    const cy = y0 + cell.y * step;
    const dpr = this.dpr || 1;
    const source = radius * 2 * dpr;

    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(
      this.canvas,
      (cx - radius) * dpr,
      (cy - radius) * dpr,
      source,
      source,
      0,
      0,
      target.width,
      target.height,
    );

    const center = target.width / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(177, 64, 47, 0.9)";
    ctx.lineWidth = Math.max(1, target.width * 0.008);
    ctx.beginPath();
    ctx.moveTo(center, center - target.width * 0.14);
    ctx.lineTo(center, center + target.width * 0.14);
    ctx.moveTo(center - target.width * 0.14, center);
    ctx.lineTo(center + target.width * 0.14, center);
    ctx.stroke();
    ctx.restore();
  }

  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((time) => {
      this.raf = 0;
      this.draw(time);
    });
  }

  /** 屏幕坐标 → 棋盘交叉点（允许半格误差），落在交叉点附近才算命中。 */
  hitTest(clientX, clientY) {
    if (!this.game || !this.width) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { x0, y0, cell } = this.geometry;
    if (cell <= 0) return null;

    const gx = Math.round((x - x0) / cell);
    const gy = Math.round((y - y0) / cell);
    if (gx < 0 || gy < 0 || gx >= this.game.size || gy >= this.game.size) return null;

    const dx = x - (x0 + gx * cell);
    const dy = y - (y0 + gy * cell);
    if (Math.hypot(dx, dy) > cell * 0.55) return null;

    return { x: gx, y: gy };
  }

  buildSurface() {
    if (!this.width || !this.size) return;

    const { width: w, height: h, dpr, geometry } = this;
    const { x0, y0, cell, pad } = geometry;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // 木纹底色
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, "#f0d2a2");
    base.addColorStop(0.45, "#e3b87c");
    base.addColorStop(1, "#cf9c5c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // 木纹纹理
    const rand = mulberry32(20240517 + this.size);
    ctx.lineCap = "round";
    for (let i = 0; i < 74; i += 1) {
      const yBase = rand() * (h + 40) - 20;
      const amp = 4 + rand() * 14;
      const light = rand() > 0.5;
      ctx.strokeStyle = light
        ? `rgba(255, 238, 205, ${0.035 + rand() * 0.05})`
        : `rgba(112, 68, 28, ${0.025 + rand() * 0.045})`;
      ctx.lineWidth = 0.6 + rand() * 1.8;
      ctx.beginPath();
      ctx.moveTo(-30, yBase);
      const segments = 3;
      const step = (w + 60) / segments;
      for (let s = 1; s <= segments; s += 1) {
        const px = -30 + step * s;
        const py = yBase + Math.sin((s + i) * 1.7) * amp * rand();
        const cx = px - step / 2;
        const cy = yBase + Math.sin((s + i) * 2.3 + 1) * amp;
        ctx.quadraticCurveTo(cx, cy, px, py);
      }
      ctx.stroke();
    }

    // 柔光与暗角
    const sheen = ctx.createLinearGradient(0, 0, w * 0.8, h * 0.9);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    sheen.addColorStop(0.45, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(1, "rgba(84, 48, 14, 0.12)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
    vignette.addColorStop(0, "rgba(60, 34, 8, 0)");
    vignette.addColorStop(1, "rgba(60, 34, 8, 0.2)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // 网格
    const end = x0 + cell * (this.size - 1);
    ctx.strokeStyle = "rgba(88, 56, 26, 0.66)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < this.size; i += 1) {
      const px = x0 + i * cell;
      ctx.moveTo(px, y0);
      ctx.lineTo(px, end);
      ctx.moveTo(x0, px);
      ctx.lineTo(end, px);
    }
    ctx.stroke();

    // 星位
    const edges = this.size >= 13 ? 3 : 2;
    const mid = (this.size - 1) / 2;
    const stars = [
      [edges, edges],
      [this.size - 1 - edges, edges],
      [edges, this.size - 1 - edges],
      [this.size - 1 - edges, this.size - 1 - edges],
      [mid, mid],
    ];
    if (this.size >= 19) {
      stars.push([mid, edges], [mid, this.size - 1 - edges], [edges, mid], [this.size - 1 - edges, mid]);
    }
    ctx.fillStyle = "rgba(76, 48, 20, 0.82)";
    for (const [sx, sy] of stars) {
      ctx.beginPath();
      ctx.arc(x0 + sx * cell, y0 + sy * cell, Math.max(2, cell * 0.078), 0, Math.PI * 2);
      ctx.fill();
    }

    // 坐标
    const fontSize = Math.max(10, Math.min(13, cell * 0.3));
    ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = "rgba(92, 58, 26, 0.52)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const bottomY = end + pad * 0.56;
    const leftX = x0 - pad * 0.52;
    for (let i = 0; i < this.size; i += 1) {
      ctx.fillText(LETTERS[i] || "", x0 + i * cell, bottomY);
      ctx.fillText(String(i + 1), leftX, y0 + i * cell);
    }

    this.surface = canvas;
  }

  buildSprites() {
    const { cell } = this.geometry;
    const dpr = this.dpr;
    if (!cell || cell === this.spriteCell) return;
    this.spriteCell = cell;
    this.sprites = {
      black: this.makeStoneSprite(cell, dpr, 1),
      white: this.makeStoneSprite(cell, dpr, 2),
    };
  }

  makeStoneSprite(cell, dpr, player) {
    const box = cell * STONE_BOX;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(box * dpr));
    canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const cx = box / 2;
    const cy = box / 2;
    const r = cell * 0.45;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.shadowColor = "rgba(54, 32, 10, 0.42)";
    ctx.shadowBlur = cell * 0.18;
    ctx.shadowOffsetY = cell * 0.06;

    const gradient = ctx.createRadialGradient(
      cx - r * 0.34,
      cy - r * 0.4,
      r * 0.08,
      cx,
      cy,
      r * 1.03,
    );

    if (player === 1) {
      gradient.addColorStop(0, "#6e6e6e");
      gradient.addColorStop(0.42, "#2c2c2c");
      gradient.addColorStop(0.82, "#0c0c0c");
      gradient.addColorStop(1, "#000000");
    } else {
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.5, "#f6f1e6");
      gradient.addColorStop(0.85, "#ddd2bd");
      gradient.addColorStop(1, "#c6b99f");
    }
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowColor = "transparent";
    if (player === 2) {
      ctx.strokeStyle = "rgba(96, 74, 42, 0.22)";
      ctx.lineWidth = Math.max(0.6, cell * 0.012);
      ctx.stroke();
    }

    // 高光
    const highlight = ctx.createRadialGradient(
      cx - r * 0.38,
      cy - r * 0.42,
      0,
      cx - r * 0.38,
      cy - r * 0.42,
      r * 0.7,
    );
    highlight.addColorStop(0, player === 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  drawStoneAt(x, y, alpha, scale) {
    if (!this.sprites) return;
    const { x0, y0, cell } = this.geometry;
    const player = this.game.cells[y * this.game.size + x];
    if (!player) return;
    const sprite = player === 1 ? this.sprites.black : this.sprites.white;
    const box = cell * STONE_BOX * scale;
    const cx = x0 + x * cell;
    const cy = y0 + y * cell;

    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(sprite, cx - box / 2, cy - box / 2, box, box);
    this.ctx.globalAlpha = 1;
  }

  hasAnimation(now) {
    if (this.lastAnim && now - this.lastAnim.start < 220) return true;
    if (this.winAnim && now - this.winAnim < 640) return true;
    if (this.hint && this.motion && now < this.hintAnimUntil && this.game && !this.game.isOver) {
      return true;
    }
    return false;
  }

  draw(now) {
    const { ctx, width: w, height: h, game } = this;
    if (!game || !w) return;

    ctx.clearRect(0, 0, w, h);
    if (this.surface) ctx.drawImage(this.surface, 0, 0, w, h);

    const { x0, y0, cell } = this.geometry;
    const size = game.size;

    // 悬停预览
    if (this.hover && !game.isOver) {
      const index = this.hover.y * size + this.hover.x;
      if (game.cells[index] === 0) {
        const color = game.current === 1 ? "black" : "white";
        const sprite = this.sprites ? this.sprites[color] : null;
        if (sprite) {
          const cx = x0 + this.hover.x * cell;
          const cy = y0 + this.hover.y * cell;
          const box = cell * STONE_BOX;
          ctx.globalAlpha = 0.32;
          ctx.drawImage(sprite, cx - box / 2, cy - box / 2, box, box);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 棋子（含落子动画）
    const anim = this.lastAnim;
    for (let gy = 0; gy < size; gy += 1) {
      for (let gx = 0; gx < size; gx += 1) {
        const index = gy * size + gx;
        if (game.cells[index] === 0) continue;
        let alpha = 1;
        let scale = 1;
        if (anim && anim.index === index) {
          const k = clamp01((now - anim.start) / 190);
          alpha = Math.min(1, k * 3);
          scale = 0.55 + 0.45 * easeOutCubic(k);
        }
        this.drawStoneAt(gx, gy, alpha, scale);
      }
    }

    // 最后一手标记
    if (!game.winLine && game.lastMove) {
      const { x, y } = game.lastMove;
      const cx = x0 + x * cell;
      const cy = y0 + y * cell;
      const r = Math.max(2, cell * 0.105);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = game.lastMove.player === 1 ? "rgba(228, 168, 120, 0.95)" : "rgba(177, 64, 47, 0.92)";
      ctx.fill();
    }

    // 军师建议：呼吸虚线圈 + 中心点
    if (this.hint && !game.isOver) {
      const index = this.hint.y * size + this.hint.x;
      if (game.cells[index] === 0) {
        const cx = x0 + this.hint.x * cell;
        const cy = y0 + this.hint.y * cell;
        const phase = now / 340;
        const pulse = this.motion ? 1 + Math.sin(phase) * 0.09 : 1;
        const alpha = this.motion ? 0.72 + (Math.sin(phase) + 1) * 0.09 : 0.9;
        const r = Math.max(6, cell * 0.34) * pulse;
        ctx.save();
        ctx.strokeStyle = `rgba(22, 122, 108, ${alpha})`;
        ctx.fillStyle = "rgba(22, 122, 108, 0.9)";
        ctx.lineWidth = Math.max(2, cell * 0.055);
        ctx.setLineDash([cell * 0.16, cell * 0.12]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, cell * 0.075), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 键盘光标：方向键移动时显示
    if (this.cursor && !game.isOver) {
      const cx = x0 + this.cursor.x * cell;
      const cy = y0 + this.cursor.y * cell;
      const half = Math.max(7, cell * 0.46);
      ctx.save();
      ctx.strokeStyle = "rgba(177, 64, 47, 0.92)";
      ctx.lineWidth = Math.max(1.8, cell * 0.05);
      ctx.setLineDash([cell * 0.11, cell * 0.09]);
      ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
      ctx.restore();
    }

    // 胜利连线（带绘制动画）
    if (game.winLine && game.winLine.length >= 2) {
      const startAt = this.winAnim ?? now;
      const k = clamp01((now - startAt) / 420);
      const first = game.winLine[0];
      const last = game.winLine[game.winLine.length - 1];
      const ax = x0 + first.x * cell;
      const ay = y0 + first.y * cell;
      const bx = x0 + last.x * cell;
      const by = y0 + last.y * cell;
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const extend = cell * 0.55;
      const sx = ax - ux * extend;
      const sy = ay - uy * extend;
      const total = length + extend * 2;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2.5, cell * 0.11);
      ctx.strokeStyle = "rgba(177, 64, 47, 0.78)";
      ctx.shadowColor = "rgba(177, 64, 47, 0.35)";
      ctx.shadowBlur = cell * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ux * total * easeOutCubic(k), sy + uy * total * easeOutCubic(k));
      ctx.stroke();
      ctx.restore();
    }

    if (this.hasAnimation(now)) this.requestDraw();
  }
}
