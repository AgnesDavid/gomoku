import { chooseMove } from "./ai.js?v=20261106-3";

/**
 * 低难度 JS AI 的 module worker。
 * 只接收局面快照，不接触 DOM；搜索仍然使用同一份 ai.js。
 */

self.onmessage = (event) => {
  const { id, type, payload } = event.data || {};
  if (type !== "move") {
    self.postMessage({ id, type: "error", message: `未知消息类型：${type}` });
    return;
  }

  try {
    const game = {
      size: payload.size,
      cells: Int8Array.from(payload.cells),
      current: payload.current,
      history: new Array(payload.moveCount),
    };
    const move = chooseMove(game, payload.level);
    self.postMessage({ id, type: "move", move });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: String(error && error.message ? error.message : error),
    });
  }
};
