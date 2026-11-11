/**
 * Rapfi WASM 的主线程控制器。
 *
 * - 只在困难/高手/挑战档使用；其余档继续用纯 JS AI。
 * - Worker 加载失败、WASM 不支持或运行出错时抛错，由主流程回退到 JS AI。
 */

const RAPFI_LEVELS = {
  hard: {
    time: 80,
    strength: 60,
    maxDepth: 8,
    maxNodes: 30000,
    caution: 2,
  },
  master: {
    time: 500,
    strength: 100,
    maxDepth: 64,
    maxNodes: 0,
    caution: 3,
  },
  challenge: {
    time: 5000,
    strength: 100,
    maxDepth: 64,
    maxNodes: 0,
    caution: 3,
  },
};

const RAPFI_HINT = {
  time: 1500,
  strength: 100,
  maxDepth: 64,
  maxNodes: 0,
  caution: 3,
};

const RAPFI_ANALYSIS = {
  time: 800,
  strength: 100,
  maxDepth: 64,
  maxNodes: 0,
  caution: 3,
};

// 改 Worker / wasm 后递增，避免浏览器继续用旧缓存。
const RAPFI_VERSION = "20261106-3";
const INIT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 5000;

export class RapfiAI {
  constructor({ idleRelease = false } = {}) {
    this.worker = null;
    this.readyPromise = null;
    this.readyReject = null;
    this.isReady = false;
    this.pending = new Map();
    this.nextId = 1;
    this.initId = 0;
    this.initTimer = 0;
    this.releaseTimer = 0;
    this.idleRelease = idleRelease;
    this.failed = false;
    this.prefetched = false;
  }

  /** 在空闲时把 wasm/权重放进 HTTP 缓存，让第一次困难/军师少等一会。 */
  prefetch() {
    if (this.prefetched || this.failed) return;
    this.prefetched = true;

    const load = () => {
      const base = new URL("../vendor/rapfi/", import.meta.url);
      for (const file of [
        "rapfi-single-simd128.js",
        "rapfi-single-simd128.wasm",
        "rapfi-single-simd128.data",
      ]) {
        fetch(new URL(`${file}?v=${RAPFI_VERSION}`, base), { cache: "force-cache" }).catch(
          () => {
            // 预取失败不影响正常加载流程。
          },
        );
      }
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 2500 });
    } else {
      window.setTimeout(load, 800);
    }
  }

  ensureWorker() {
    if (this.failed) return Promise.reject(new Error("Rapfi 不可用"));
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker(
          new URL(`./rapfi-worker.js?v=${RAPFI_VERSION}`, import.meta.url),
        );
      } catch (error) {
        this.failed = true;
        reject(error);
        return;
      }

      this.worker = worker;
      const fail = (error) => {
        clearTimeout(this.initTimer);
        this.initTimer = 0;
        this.failed = true;
        this.readyPromise = null;
        this.readyReject = null;
        this.worker = null;
        this.isReady = false;
        worker.onerror = null;
        worker.onmessage = null;
        try {
          worker.terminate();
        } catch {
          // ignore
        }
        for (const request of this.pending.values()) {
          clearTimeout(request.timer);
          request.reject(error);
        }
        this.pending.clear();
        reject(error);
      };

      worker.onerror = (event) => {
        fail(new Error(event.message || "Rapfi Worker 加载失败"));
      };

      worker.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === "ready") {
          clearTimeout(this.initTimer);
          this.initTimer = 0;
          this.readyReject = null;
          this.isReady = true;
          resolve();
          return;
        }
        if (message.type === "error" && message.id === this.initId) {
          fail(new Error(message.message || "Rapfi 初始化失败"));
          return;
        }

        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        clearTimeout(request.timer);

        if (message.type === "error") {
          request.reject(new Error(message.message || "Rapfi 计算失败"));
        } else if (message.type === "move" && message.move) {
          request.resolve(message.move);
        } else if (message.type === "analysis") {
          request.resolve({
            move: message.move || null,
            eval: message.eval,
            winRate: message.winRate,
            depth: message.depth,
          });
        } else {
          request.reject(new Error("Rapfi 返回了无效结果"));
        }
      };

      const id = this.nextId++;
      this.initId = id;
      this.readyReject = reject;
      this.initTimer = setTimeout(() => {
        fail(new Error("Rapfi 初始化超时"));
      }, INIT_TIMEOUT_MS);
      worker.postMessage({ id, type: "init" });
    });

    return this.readyPromise;
  }

  async chooseMove(game, level) {
    const config = RAPFI_LEVELS[level];
    if (!config) throw new Error(`Rapfi 不支持难度：${level}`);
    return this.request(game, config, "move");
  }

  /** 给人类玩家算一步建议，不影响后续 AI 的会话。 */
  async requestHint(game) {
    return this.request(game, RAPFI_HINT, "hint");
  }

  /** 分析当前局面，返回引擎评分、深度和建议着法。 */
  async analyze(game, time = RAPFI_ANALYSIS.time) {
    return this.request(game, { ...RAPFI_ANALYSIS, time }, "analyze");
  }

  async request(game, config, type) {
    await this.ensureWorker();
    if (!this.worker) throw new Error("Rapfi Worker 不可用");

    const history = game.history.map((move) => ({
      x: move.x,
      y: move.y,
      // Game.history 存的是 player（1 黑 / 2 白），不是 color。
      color: move.player === 1 ? 1 : 2,
    }));

    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Rapfi 思考超时"));
        // 卡住的 Worker 不能继续复用，直接重建。
        this.cancel();
      }, config.time + REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });

    this.worker.postMessage({
      id,
      type,
      payload: {
        size: game.size,
        history,
        time: config.time,
        strength: config.strength,
        maxDepth: config.maxDepth,
        maxNodes: config.maxNodes,
        caution: config.caution,
        // Piskvork 的 BOARD 颜色是「1=自己，2=对手」，不是绝对黑白。
        aiColor: game.current,
      },
    });

    return promise.finally(() => this.scheduleRelease());
  }

  scheduleRelease(delay = 120000) {
    if (!this.idleRelease) return;
    clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = 0;
      if (this.pending.size === 0) this.cancel();
    }, delay);
  }

  cancel() {
    clearTimeout(this.initTimer);
    this.initTimer = 0;
    clearTimeout(this.releaseTimer);
    this.releaseTimer = 0;
    if (this.readyReject) {
      this.readyReject(new Error("Rapfi 已取消"));
      this.readyReject = null;
    }
    if (this.worker) {
      // 先摘掉回调，避免 terminate 过程中旧 Worker 的事件把新实例标记为失败。
      this.worker.onerror = null;
      this.worker.onmessage = null;
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
    }
    this.worker = null;
    this.readyPromise = null;
    this.isReady = false;
    this.failed = false;

    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Rapfi 已取消"));
    }
    this.pending.clear();
  }
}
