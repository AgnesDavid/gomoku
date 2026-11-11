/**
 * JS AI 的 Worker 控制器。
 *
 * 低难度搜索放在主线程会卡住界面，这里统一挪到 module worker；
 * Worker 不可用时由主流程回退到主线程 chooseMove。
 */

const AI_VERSION = "20261106-3";
const REQUEST_TIMEOUT_MS = 6000;

export class JsAI {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.failed = false;
  }

  ensureWorker() {
    if (this.failed) throw new Error("JS AI 不可用");
    if (this.worker) return this.worker;

    let worker;
    try {
      worker = new Worker(
        new URL(`./js-ai-worker.js?v=${AI_VERSION}`, import.meta.url),
        { type: "module" },
      );
    } catch (error) {
      this.failed = true;
      throw error;
    }

    this.worker = worker;
    worker.onmessage = (event) => {
      const message = event.data || {};
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.type === "error") {
        request.reject(new Error(message.message || "JS AI 计算失败"));
      } else if (message.type === "move") {
        request.resolve(message.move || null);
      } else {
        request.reject(new Error("JS AI 返回了无效结果"));
      }
    };

    worker.onerror = (event) => {
      this.failed = true;
      this.failPending(new Error(event.message || "JS AI Worker 加载失败"));
    };

    return worker;
  }

  failPending(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.onerror = null;
      this.worker.onmessage = null;
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
    }
    this.worker = null;
  }

  chooseMove(game, level) {
    const worker = this.ensureWorker();
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("JS AI 思考超时"));
        this.cancel();
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });

      try {
        worker.postMessage({
          id,
          type: "move",
          payload: {
            size: game.size,
            cells: Array.from(game.cells),
            current: game.current,
            moveCount: game.history.length,
            level,
          },
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  cancel() {
    this.failPending(new Error("JS AI 已取消"));
    this.failed = false;
  }
}
