import { BLACK, DIRECTIONS, EMPTY, WHITE, hasFive, opponent } from "./game.js?v=20261106-3";

/**
 * 主线程 AI：棋型评估 + Alpha-Beta 搜索。
 * 不依赖 Worker，靠时间预算和候选点剪枝把单步耗时压在几百毫秒内。
 * 最高难度额外带一层「冲四算杀」（VCF）搜索。
 */

const WIN = 1e9;
const ABORT = Symbol("search-aborted");

const JS_MASTER = {
  rootMoves: 16,
  innerMoves: 8,
  minDepth: 2,
  maxDepth: 8,
  time: 1100,
  noise: 0,
  guard: true,
  vcf: { depth: 12, time: 140, nodes: 3200 },
  vct: { depth: 14, time: 180, nodes: 3600 },
  vctDefense: { depth: 10, time: 60, nodes: 1200 },
};

const LEVELS = {
  // 新手 = 旧版的“简单”
  novice: {
    rootMoves: 10,
    innerMoves: 6,
    minDepth: 2,
    maxDepth: 2,
    time: 120,
    noise: 0.3,
  },
  // 简单 = 旧版的“普通”
  easy: {
    rootMoves: 12,
    innerMoves: 8,
    minDepth: 2,
    maxDepth: 4,
    time: 280,
    noise: 0,
    guard: true,
  },
  // 普通 = 旧版的“高手”；困难/高手/挑战默认走 WASM，这里是加载失败时的回退。
  normal: JS_MASTER,
  hard: JS_MASTER,
  master: JS_MASTER,
  challenge: JS_MASTER,
};

/**
 * 置换表：同一局面在搜索中经常重复出现（不同落子顺序、迭代加深之间）。
 * 用 Zobrist 双 32 位哈希 + 固定大小的直接映射表，命中就复用深度和分数。
 */
const TT_BITS = 17;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const ttKeyLo = new Int32Array(TT_SIZE);
const ttKeyHi = new Int32Array(TT_SIZE);
const ttScore = new Float64Array(TT_SIZE);
const ttDepth = new Uint8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);

const ZOBRIST = (() => {
  let seed = 0x9e3779b9 | 0;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed | 0;
  };
  const lo = new Int32Array(19 * 19 * 2);
  const hi = new Int32Array(19 * 19 * 2);
  for (let i = 0; i < lo.length; i += 1) {
    lo[i] = next();
    hi[i] = next();
  }
  return { lo, hi, sideLo: next(), sideHi: next() };
})();

let ttConfigKey = "";

function ensureTT(size, level) {
  const key = `${size}:${level}`;
  if (ttConfigKey !== key) {
    ttConfigKey = key;
    ttFlag.fill(0);
  }
}

/** 邻域权重：靠近已有棋子的空点优先展开。 */
const OFFSETS = [];for (let dy = -2; dy <= 2; dy += 1) {
  for (let dx = -2; dx <= 2; dx += 1) {
    if (dx === 0 && dy === 0) continue;
    OFFSETS.push([dx, dy, Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 6 : 1.5]);
  }
}

const lineCache = new Map();

/** 预计算棋盘上所有长度 ≥ 5 的线（行、列、两条斜线）。 */
function getLines(size) {
  const cached = lineCache.get(size);
  if (cached) return cached;

  const lines = [];
  const push = (points) => {
    if (points.length >= 5) {
      lines.push(Int32Array.from(points, ([x, y]) => y * size + x));
    }
  };

  for (let y = 0; y < size; y += 1) {
    const row = [];
    for (let x = 0; x < size; x += 1) row.push([x, y]);
    push(row);
  }

  for (let x = 0; x < size; x += 1) {
    const col = [];
    for (let y = 0; y < size; y += 1) col.push([x, y]);
    push(col);
  }

  // ↘ 方向：从左边一列和上边一行出发
  for (let y = 0; y < size; y += 1) {
    const diagonal = [];
    for (let x = 0, yy = y; x < size && yy < size; x += 1, yy += 1) diagonal.push([x, yy]);
    push(diagonal);
  }
  for (let x = 1; x < size; x += 1) {
    const diagonal = [];
    for (let xx = x, y = 0; xx < size && y < size; xx += 1, y += 1) diagonal.push([xx, y]);
    push(diagonal);
  }

  // ↙ 方向：从左边一列和下边一行出发
  for (let y = 0; y < size; y += 1) {
    const diagonal = [];
    for (let x = 0, yy = y; x < size && yy >= 0; x += 1, yy -= 1) diagonal.push([x, yy]);
    push(diagonal);
  }
  for (let x = 1; x < size; x += 1) {
    const diagonal = [];
    for (let xx = x, y = size - 1; xx < size && y >= 0; xx += 1, y -= 1) diagonal.push([xx, y]);
    push(diagonal);
  }

  lineCache.set(size, lines);
  return lines;
}

function runScore(length, openEnds) {
  if (length >= 5) return 10_000_000;
  if (openEnds === 0) return 0;
  if (length === 4) return openEnds === 2 ? 1_000_000 : 120_000;
  if (length === 3) return openEnds === 2 ? 12_000 : 1_200;
  if (length === 2) return openEnds === 2 ? 600 : 80;
  return openEnds === 2 ? 12 : 3;
}

/** 静态评估：扫描所有线，累计连续棋型分数，返回当前行棋方的视角分。 */
function evaluate(cells, size, player) {
  const lines = getLines(size);
  let black = 0;
  let white = 0;

  for (let l = 0; l < lines.length; l += 1) {
    const line = lines[l];
    let i = 0;
    while (i < line.length) {
      const value = cells[line[i]];
      if (value === EMPTY) {
        i += 1;
        continue;
      }

      let j = i;
      while (j + 1 < line.length && cells[line[j + 1]] === value) j += 1;

      const length = j - i + 1;
      const openLeft = i > 0 && cells[line[i - 1]] === EMPTY;
      const openRight = j + 1 < line.length && cells[line[j + 1]] === EMPTY;
      const score = runScore(length, (openLeft ? 1 : 0) + (openRight ? 1 : 0));

      if (value === BLACK) black += score;
      else white += score;

      i = j + 1;
    }
  }

  return player === BLACK ? black - white * 1.12 : white - black * 1.12;
}

function createState(cells, size) {
  const near = new Float32Array(size * size);

  const bump = (index, sign) => {
    const x = index % size;
    const y = (index / size) | 0;
    for (let o = 0; o < OFFSETS.length; o += 1) {
      const [dx, dy, weight] = OFFSETS[o];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const target = ny * size + nx;
      if (cells[target] === EMPTY) near[target] += sign * weight;
    }
  };

  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY) bump(i, 1);
  }

  return { cells, near, bump };
}

function topCandidates(state, limit) {
  const { cells, near } = state;
  const picked = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === EMPTY && near[i] > 0) picked.push(i);
  }
  picked.sort((a, b) => near[b] - near[a]);
  if (picked.length > limit) picked.length = limit;
  return picked;
}

/** 在 (x,y) 落一子后，该颜色在这条线上能形成多长的连子、两端是否开放。 */
function sidePotential(cells, size, x, y, color) {
  let best = 0;
  for (let d = 0; d < DIRECTIONS.length; d += 1) {
    const [dx, dy] = DIRECTIONS[d];
    let count = 1;
    let openA = false;
    let openB = false;

    for (let step = 1; step <= 6; step += 1) {
      const nx = x + dx * step;
      const ny = y + dy * step;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
      const value = cells[ny * size + nx];
      if (value === color) {
        count += 1;
      } else {
        openA = value === EMPTY;
        break;
      }
    }

    for (let step = 1; step <= 6; step += 1) {
      const nx = x - dx * step;
      const ny = y - dy * step;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
      const value = cells[ny * size + nx];
      if (value === color) {
        count += 1;
      } else {
        openB = value === EMPTY;
        break;
      }
    }

    const open = (openA ? 1 : 0) + (openB ? 1 : 0);
    let value = 0;
    if (count >= 5) {
      value = 1e7;
    } else if (count === 4) {
      value = open === 2 ? 1e6 : open === 1 ? 8000 : 0;
    } else if (count === 3) {
      value = open === 2 ? 1200 : open === 1 ? 180 : 0;
    } else if (count === 2) {
      value = open === 2 ? 90 : open === 1 ? 18 : 0;
    } else {
      value = open === 2 ? 8 : 2;
    }
    if (value > best) best = value;
  }
  return best;
}

/**
 * 近邻候选点排序：除了距离权重，还看「这个点对双方各有多大的成线价值」，
 * 保证活三、冲四这类关键点不会被密集棋堆挤掉。
 */
function tacticalCandidates(state, size, player, limit) {
  const { cells, near } = state;
  const opp = opponent(player);
  const picked = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY || near[i] <= 0) continue;
    const x = i % size;
    const y = (i / size) | 0;
    const attack = sidePotential(cells, size, x, y, player);
    const defend = sidePotential(cells, size, x, y, opp);
    picked.push({ index: i, score: attack + defend * 0.95 + near[i] * 0.02 });
  }
  picked.sort((a, b) => b.score - a.score);
  return picked.slice(0, limit).map((entry) => entry.index);
}

function firstEmpty(cells) {
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === EMPTY) return i;
  }
  return -1;
}

function winningMoves(cells, size, player, near, limit = 1) {
  const found = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY || near[i] <= 0) continue;
    const x = i % size;
    const y = (i / size) | 0;
    cells[i] = player;
    const win = hasFive(cells, size, x, y, player);
    cells[i] = EMPTY;
    if (win) {
      found.push(i);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/** 落子在 (x,y) 后，所有「再下一手就能连五」的空点。 */
function fourCompletions(cells, size, x, y, player) {
  const completions = new Set();
  for (let d = 0; d < DIRECTIONS.length; d += 1) {
    const [dx, dy] = DIRECTIONS[d];
    for (let start = -4; start <= 0; start += 1) {
      let mine = 0;
      let hole = -1;
      let valid = true;
      for (let k = 0; k < 5; k += 1) {
        const nx = x + (start + k) * dx;
        const ny = y + (start + k) * dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
          valid = false;
          break;
        }
        const value = cells[ny * size + nx];
        if (value === player) {
          mine += 1;
        } else if (value === EMPTY) {
          if (hole !== -1) {
            valid = false;
            break;
          }
          hole = ny * size + nx;
        } else {
          valid = false;
          break;
        }
      }
      if (valid && mine === 4 && hole !== -1) completions.add(hole);
    }
  }
  return [...completions];
}

function fourMoves(cells, size, player, near) {
  const moves = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY || near[i] <= 0) continue;
    const x = i % size;
    const y = (i / size) | 0;
    cells[i] = player;
    const completions = fourCompletions(cells, size, x, y, player);
    cells[i] = EMPTY;
    if (completions.length) moves.push({ index: i, completions });
  }
  moves.sort((a, b) => b.completions.length - a.completions.length);
  return moves;
}

/** 对手下一手就能做出「活四」（两个成五点）的点位。 */
function openFourThreats(cells, size, color, near) {
  const threats = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY || near[i] <= 0) continue;
    const x = i % size;
    const y = (i / size) | 0;
    cells[i] = color;
    const completions = fourCompletions(cells, size, x, y, color);
    cells[i] = EMPTY;
    if (completions.length >= 2) threats.push(i);
  }
  return threats;
}

/**
 * VCF（连续冲四）搜索：只走「下一手能连五」的威胁着法，
 * 对手唯一的选择是堵住唯一的成五点。找到强制取胜序列则返回第一步。
 */
function vcfSearch(cells, size, player, depth, budget, near) {
  budget.nodes += 1;
  if (budget.nodes > budget.maxNodes || performance.now() > budget.deadline) return -1;

  const immediate = winningMoves(cells, size, player, near, 1);
  if (immediate.length) return immediate[0];
  if (depth <= 0) return -1;
  if (winningMoves(cells, size, opponent(player), near, 1).length) return -1;

  const moves = fourMoves(cells, size, player, near);
  for (let m = 0; m < moves.length; m += 1) {
    if (budget.nodes > budget.maxNodes || performance.now() > budget.deadline) return -1;
    const { index, completions } = moves[m];
    cells[index] = player;

    let wins = false;
    if (completions.length >= 2) {
      wins = true;
    } else {
      const other = opponent(player);
      const block = completions[0];
      cells[block] = other;
      const bx = block % size;
      const by = (block / size) | 0;
      if (
        !hasFive(cells, size, bx, by, other) &&
        vcfSearch(cells, size, player, depth - 1, budget, near) !== -1
      ) {
        wins = true;
      }
      cells[block] = EMPTY;
    }

    cells[index] = EMPTY;
    if (wins) return index;
  }
  return -1;
}

/** 落子 (x,y) 之后，哪些空点再落一子能形成活四（两个成五点）。 */
function localOpenFourPoints(cells, size, player, x, y, near) {
  const points = [];
  const seen = new Set();
  for (let d = 0; d < DIRECTIONS.length; d += 1) {
    const [dx, dy] = DIRECTIONS[d];
    for (let step = -4; step <= 4; step += 1) {
      if (step === 0) continue;
      const px = x + dx * step;
      const py = y + dy * step;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const index = py * size + px;
      if (cells[index] !== EMPTY || near[index] <= 0 || seen.has(index)) continue;
      cells[index] = player;
      const completions = fourCompletions(cells, size, px, py, player);
      cells[index] = EMPTY;
      if (completions.length >= 2) {
        seen.add(index);
        points.push({ point: index, completions });
      }
    }
  }
  return points;
}

/**
 * VCT 的威胁点：落下后存在「下一手能形成活四」的点。
 * 对手的防法不只是占住那个点，还包括占住活四的两个成五点；
 * 所以把「威胁点 + 成五点」一起作为对手的防守集合。
 */
function threatMoves(cells, size, player, near, limit) {
  const found = [];

  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY || near[i] <= 0) continue;
    const x = i % size;
    const y = (i / size) | 0;
    cells[i] = player;

    if (!hasFive(cells, size, x, y, player)) {
      const points = localOpenFourPoints(cells, size, player, x, y, near);
      if (points.length) {
        const defense = new Set();
        for (const entry of points) {
          defense.add(entry.point);
          for (const completion of entry.completions) defense.add(completion);
        }
        found.push({ index: i, defense: [...defense] });
      }
    }

    cells[i] = EMPTY;
  }

  found.sort(
    (a, b) => b.defense.length - a.defense.length || near[b.index] - near[a.index],
  );
  return found.slice(0, limit);
}

/**
 * VCT（连续活三/冲四）搜索：
 * 先走冲四；再走能做出「活四威胁」的活三/跳三，对手被迫堵，
 * 然后继续找冲四/活三。对手有现成冲四时放弃活三线路，避免假必胜。
 */
function vctSearch(cells, size, player, depth, budget, near) {
  budget.nodes += 1;
  if (budget.nodes > budget.maxNodes || performance.now() > budget.deadline) return -1;

  const opp = opponent(player);
  const immediate = winningMoves(cells, size, player, near, 1);
  if (immediate.length) return immediate[0];
  if (depth <= 0) return -1;
  if (winningMoves(cells, size, opp, near, 1).length) return -1;

  // 冲四：对手只有唯一成五点可堵，继续算。
  const fours = fourMoves(cells, size, player, near);
  for (let m = 0; m < fours.length; m += 1) {
    if (budget.nodes > budget.maxNodes || performance.now() > budget.deadline) return -1;
    const { index, completions } = fours[m];
    cells[index] = player;

    let wins = false;
    if (completions.length >= 2) {
      wins = true;
    } else {
      const block = completions[0];
      cells[block] = opp;
      const bx = block % size;
      const by = (block / size) | 0;
      if (
        !hasFive(cells, size, bx, by, opp) &&
        vctSearch(cells, size, player, depth - 1, budget, near) !== -1
      ) {
        wins = true;
      }
      cells[block] = EMPTY;
    }

    cells[index] = EMPTY;
    if (wins) return index;
  }

  // 对手有冲四时，活三会被反先，直接放弃这条线（保守但不会假报必胜）。
  if (fourMoves(cells, size, opp, near).length) return -1;

  // 现在就有活四可做，直接赢。
  const direct = openFourThreats(cells, size, player, near);
  if (direct.length) return direct[0];

  const threats = threatMoves(cells, size, player, near, 8);
  for (let m = 0; m < threats.length; m += 1) {
    if (budget.nodes > budget.maxNodes || performance.now() > budget.deadline) return -1;
    const { index, defense } = threats[m];
    cells[index] = player;

    // 对手可能占住任意一个威胁点/成五点，必须每个堵法都输才算赢。
    let allWin = true;
    for (let p = 0; p < defense.length; p += 1) {
      const block = defense[p];
      cells[block] = opp;
      const bx = block % size;
      const by = (block / size) | 0;

      let wins = false;
      if (!hasFive(cells, size, bx, by, opp)) {
        // 对手挡点的同时反冲四，就抢了先手，这条线不算赢。
        if (fourCompletions(cells, size, bx, by, opp).length === 0) {
          wins = vctSearch(cells, size, player, depth - 2, budget, near) !== -1;
        }
      }

      cells[block] = EMPTY;
      if (!wins) {
        allWin = false;
        break;
      }
    }

    cells[index] = EMPTY;
    if (allWin) return index;
  }

  return -1;
}

/**
 * 选择落子。返回 { x, y }，棋盘已满时返回 null。
 * level: "novice" | "easy" | "normal" | "hard" | "master"
 */
export function chooseMove(game, level = "normal") {
  const config = LEVELS[level] || LEVELS.normal;
  const size = game.size;
  const cells = game.cells.slice();
  const me = game.current;
  const opp = opponent(me);

  if (game.history.length === 0) {
    const center = (size - 1) >> 1;
    return { x: center, y: center };
  }

  // 1. 自己能连五：直接落。
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY) continue;
    const x = i % size;
    const y = (i / size) | 0;
    cells[i] = me;
    const win = hasFive(cells, size, x, y, me);
    cells[i] = EMPTY;
    if (win) return { x, y };
  }

  // 2. 对手能连五：必须堵（多个点则已无解，堵第一个）。
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== EMPTY) continue;
    const x = i % size;
    const y = (i / size) | 0;
    cells[i] = opp;
    const win = hasFive(cells, size, x, y, opp);
    cells[i] = EMPTY;
    if (win) return { x, y };
  }

  const state = createState(cells, size);
  let roots = tacticalCandidates(state, size, me, config.rootMoves);
  if (roots.length === 0) {
    const fallback = firstEmpty(cells);
    return fallback === -1 ? null : { x: fallback % size, y: (fallback / size) | 0 };
  }

  // 3. 最高难度先算杀：能用连续冲四强制取胜就直接落。
  if (config.vcf) {
    const budget = {
      nodes: 0,
      maxNodes: config.vcf.nodes,
      deadline: performance.now() + config.vcf.time,
    };
    const forced = vcfSearch(cells, size, me, config.vcf.depth, budget, state.near);
    if (forced !== -1) return { x: forced % size, y: (forced / size) | 0 };
  }

  // 4. 再算一层 VCT：连续活三/冲四的强制胜。
  if (config.vct) {
    const budget = {
      nodes: 0,
      maxNodes: config.vct.nodes,
      deadline: performance.now() + config.vct.time,
    };
    const forced = vctSearch(cells, size, me, config.vct.depth, budget, state.near);
    if (forced !== -1) return { x: forced % size, y: (forced / size) | 0 };
  }

  ensureTT(size, level);

  let hashLo = 0;
  let hashHi = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const color = cells[i];
    if (color === EMPTY) continue;
    const key = i * 2 + (color === BLACK ? 0 : 1);
    hashLo ^= ZOBRIST.lo[key];
    hashHi ^= ZOBRIST.hi[key];
  }
  if (me === WHITE) {
    hashLo ^= ZOBRIST.sideLo;
    hashHi ^= ZOBRIST.sideHi;
  }

  const toggleHash = (index, color) => {
    const key = index * 2 + (color === BLACK ? 0 : 1);
    hashLo ^= ZOBRIST.lo[key];
    hashHi ^= ZOBRIST.hi[key];
    hashLo ^= ZOBRIST.sideLo;
    hashHi ^= ZOBRIST.sideHi;
  };

  const startedAt = performance.now();
  const deadline = startedAt + config.time;
  let nodes = 0;

  const killerA = new Int32Array(24).fill(-1);
  const killerB = new Int32Array(24).fill(-1);
  const history = new Int32Array(cells.length);

  const negamax = (player, depth, alpha, beta, ply) => {
    nodes += 1;
    if ((nodes & 127) === 0 && performance.now() > deadline) throw ABORT;

    if (depth === 0) return evaluate(cells, size, player);

    const alphaOrig = alpha;
    const betaOrig = beta;
    const slot = hashLo & TT_MASK;
    let ttBest = -1;

    if (ttFlag[slot] !== 0 && ttKeyLo[slot] === hashLo && ttKeyHi[slot] === hashHi) {
      ttBest = ttMove[slot];
      if (ttDepth[slot] >= depth) {
        const cached = ttScore[slot];
        // 将杀分数带 ply 信息，跨层复用容易错位，只缓存普通分数。
        if (Math.abs(cached) < WIN - 1000) {
          const flag = ttFlag[slot];
          if (
            flag === TT_EXACT ||
            (flag === TT_LOWER && cached >= beta) ||
            (flag === TT_UPPER && cached <= alpha)
          ) {
            return cached;
          }
        }
      }
    }

    const limit = depth >= 4 ? config.innerMoves : config.innerMoves + 2;
    const moves =
      depth >= 4
        ? tacticalCandidates(state, size, player, limit)
        : topCandidates(state, limit);
    if (moves.length === 0) return 0;

    const k1 = killerA[ply];
    const k2 = killerB[ply];
    if (k1 !== -1 || k2 !== -1) {
      moves.sort((a, b) => {
        const rank = (index) => (index === k1 ? 2 : index === k2 ? 1 : 0);
        const diff = rank(b) - rank(a);
        return diff !== 0 ? diff : history[b] - history[a];
      });
    }

    if (ttBest >= 0) {
      const pos = moves.indexOf(ttBest);
      if (pos > 0) {
        moves.splice(pos, 1);
        moves.unshift(ttBest);
      }
    }

    let best = -Infinity;
    let bestMove = -1;
    for (let m = 0; m < moves.length; m += 1) {
      const index = moves[m];
      const x = index % size;
      const y = (index / size) | 0;

      cells[index] = player;
      state.bump(index, 1);
      toggleHash(index, player);

      let score;
      if (hasFive(cells, size, x, y, player)) {
        score = WIN - ply;
      } else {
        score = -negamax(opponent(player), depth - 1, -beta, -alpha, ply + 1);
      }

      toggleHash(index, player);
      cells[index] = EMPTY;
      state.bump(index, -1);

      if (score > best) {
        best = score;
        bestMove = index;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (killerA[ply] !== index) {
          killerB[ply] = killerA[ply];
          killerA[ply] = index;
        }
        history[index] += depth * depth;
        break;
      }
    }

    if (best > -Infinity && Math.abs(best) < WIN - 1000) {
      const flag = best >= betaOrig ? TT_LOWER : best > alphaOrig ? TT_EXACT : TT_UPPER;
      if (
        ttKeyLo[slot] !== hashLo ||
        ttKeyHi[slot] !== hashHi ||
        ttDepth[slot] <= depth
      ) {
        ttKeyLo[slot] = hashLo;
        ttKeyHi[slot] = hashHi;
        ttScore[slot] = best;
        ttDepth[slot] = depth;
        ttFlag[slot] = flag;
        ttMove[slot] = bestMove;
      }
    }

    return best;
  };

  let bestIndex = roots[0];
  let bestScore = -Infinity;
  let completed = false;
  let scored = [];

  for (let depth = config.minDepth; depth <= config.maxDepth; depth += 2) {
    let alpha = -Infinity;
    let iterBest = -1;
    let iterScore = -Infinity;
    const iterScores = new Array(roots.length).fill(-Infinity);
    let aborted = false;

    for (let r = 0; r < roots.length; r += 1) {
      const index = roots[r];
      const x = index % size;
      const y = (index / size) | 0;

      cells[index] = me;
      state.bump(index, 1);
      toggleHash(index, me);

      let score;
      try {
        if (hasFive(cells, size, x, y, me)) {
          score = WIN;
        } else {
          score = -negamax(opp, depth - 1, -Infinity, -alpha, 1);
        }
      } catch (error) {
        toggleHash(index, me);
        cells[index] = EMPTY;
        state.bump(index, -1);
        if (error !== ABORT) throw error;
        aborted = true;
        break;
      }

      toggleHash(index, me);
      cells[index] = EMPTY;
      state.bump(index, -1);

      iterScores[r] = score;
      if (score > iterScore) {
        iterScore = score;
        iterBest = index;
      }
      if (score > alpha) alpha = score;
    }

    if (iterBest !== -1 && (!aborted || !completed)) {
      bestIndex = iterBest;
      bestScore = iterScore;
      completed = true;
      scored = roots
        .map((index, i) => ({ index, score: iterScores[i] }))
        .filter((entry) => entry.score > -Infinity)
        .sort((a, b) => b.score - a.score);
    }

    if (aborted) break;
    if (bestScore >= WIN - 1000) break;

    // 下一轮先搜这轮的好点，提高剪枝效率。
    roots = roots
      .map((index, i) => ({ index, score: iterScores[i] }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.index);

    // 深一层若按当前速度明显搜不完，就收手，别把时间耗在注定被中断的迭代上。
    const spent = performance.now() - startedAt;
    const rate = nodes / Math.max(spent, 1);
    const remaining = deadline - performance.now();
    if (depth + 2 <= config.maxDepth && nodes * 6.5 > rate * remaining) break;

    if (performance.now() > deadline) break;
  }

  // 高手额外做一层「防杀」：若某步之后对手存在连续冲四的强制胜，
  // 就按评分顺序换一步更稳的；找不到更稳的就保持原选择。
  if (config.vcf && scored.length && bestScore < WIN - 1000) {
    const seen = new Set();
    const tries = [];
    for (const entry of scored) {
      if (!seen.has(entry.index)) {
        seen.add(entry.index);
        tries.push(entry.index);
      }
      if (tries.length >= 5) break;
    }
    if (!seen.has(bestIndex)) tries.unshift(bestIndex);

    for (const index of tries) {
      const x = index % size;
      const y = (index / size) | 0;
      cells[index] = me;
      state.bump(index, 1);

      let refuted = false;
      if (hasFive(cells, size, x, y, me)) {
        bestIndex = index;
        refuted = null;
      } else {
        const budget = { nodes: 0, maxNodes: 900, deadline: performance.now() + 25 };
        refuted = vcfSearch(cells, size, opp, 8, budget, state.near) !== -1;

        // 高手再加一层 VCT 防守：对手有没有连续活三/冲四的强制胜。
        if (!refuted && config.vctDefense) {
          const vctBudget = {
            nodes: 0,
            maxNodes: config.vctDefense.nodes,
            deadline: performance.now() + config.vctDefense.time,
          };
          refuted =
            vctSearch(cells, size, opp, config.vctDefense.depth, vctBudget, state.near) !== -1;
        }
      }

      state.bump(index, -1);
      cells[index] = EMPTY;

      if (refuted === null) break;
      if (!refuted) {
        bestIndex = index;
        break;
      }
    }
  }

  // 兜底：对手下一手能做出活四时，若我们这一步不是成五/冲四，就先堵住。
  // 密集局面里候选点容易被棋堆挤掉，这一层保证不会「看着对方成三不管」。
  if (config.guard) {
    const bx = bestIndex % size;
    const by = (bestIndex / size) | 0;
    cells[bestIndex] = me;
    const winsNow = hasFive(cells, size, bx, by, me);
    const makesFour = winsNow || fourCompletions(cells, size, bx, by, me).length > 0;
    cells[bestIndex] = EMPTY;

    if (!winsNow && !makesFour) {
      const threats = openFourThreats(cells, size, opp, state.near);
      if (threats.length && !threats.includes(bestIndex)) {
        bestIndex = threats[0];
      }
    }
  }

  if (config.noise > 0 && scored.length > 1 && Math.random() < config.noise) {
    const pool = scored.slice(0, Math.min(3, scored.length));
    bestIndex = pool[Math.floor(Math.random() * pool.length)].index;
  }

  return { x: bestIndex % size, y: (bestIndex / size) | 0 };
}

export const DIFFICULTY_LABELS = {
  novice: "新手",
  easy: "简单",
  normal: "普通",
  hard: "困难",
  master: "高手",
  challenge: "挑战",
};
