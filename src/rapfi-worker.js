/**
 * Rapfi WASM 的 Worker 包装。
 *
 * 正常续弈时用 TURN 增量维护局面；只有执白首手、悔棋或重开后才用
 * BOARD/DONE 重放一次，避免每步清空置换表。
 */

let enginePromise = null;
let engine = null;
let session = null;
const output = [];

const RAPFI_VERSION = new URL(self.location.href).searchParams.get("v") || "0";

function ensureEngine() {
  if (!enginePromise) {
    importScripts(
      `../vendor/rapfi/rapfi-single-simd128.js?v=${RAPFI_VERSION}`,
    );
    enginePromise = self
      .Rapfi({
        locateFile: (file) =>
          new URL(
            `../vendor/rapfi/${file}?v=${RAPFI_VERSION}`,
            self.location.href,
          ).href,
        onReceiveStdout: (line) => output.push(line),
        onReceiveStderr: (line) => output.push(line),
      })
      .then((loaded) => {
        engine = loaded;
        return loaded;
      });
  }
  return enginePromise;
}

function parseMove() {
  for (let i = output.length - 1; i >= 0; i -= 1) {
    const line = output[i].trim();
    if (/^\d+,\d+$/.test(line)) {
      const [x, y] = line.split(",").map(Number);
      return { x, y };
    }
  }
  return null;
}

function parseEval() {
  for (let i = output.length - 1; i >= 0; i -= 1) {
    const match =
      output[i].match(/\bEVAL\s+([^\s|]+)/i) || output[i].match(/\bEval\s+([^\s|]+)/i);
    if (match) return match[1];
  }
  return null;
}

function parseWinRate() {
  for (let i = output.length - 1; i >= 0; i -= 1) {
    const match = output[i].match(/\bWINRATE\s+([0-9.]+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function parseDepth() {
  for (let i = output.length - 1; i >= 0; i -= 1) {
    const match = output[i].match(/\bDepth\s+(\d+)(?:-(\d+))?/i);
    if (match) return Number(match[2] || match[1]);
  }
  return null;
}

function sameMove(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.color === b.color;
}

function extendsSession(size, history, aiColor) {
  if (!session || session.size !== size || session.aiColor !== aiColor) return false;
  if (history.length !== session.history.length + 1) return false;
  for (let i = 0; i < session.history.length; i += 1) {
    if (!sameMove(history[i], session.history[i])) return false;
  }
  // 新增的一手必须是对手的，不能是自己的重复请求。
  return history[history.length - 1].color !== aiColor;
}

function rememberMove(history, aiColor, move) {
  session = {
    size: session.size,
    aiColor,
    history: [...history, { x: move.x, y: move.y, color: aiColor }],
  };
}

function applySettings(rapfi, { strength, maxDepth, maxNodes, caution, time }) {
  rapfi.sendCommand(`INFO STRENGTH ${strength}`);
  rapfi.sendCommand(`INFO MAX_DEPTH ${maxDepth}`);
  rapfi.sendCommand(`INFO MAX_NODE ${maxNodes}`);
  rapfi.sendCommand(`INFO CAUTION_FACTOR ${caution}`);
  rapfi.sendCommand(`INFO timeout_turn ${time}`);
}

async function computeMove({
  size,
  history,
  time,
  strength,
  maxDepth,
  maxNodes,
  caution,
  aiColor,
}) {
  const rapfi = await ensureEngine();
  output.length = 0;
  let move = null;
  const settings = { strength, maxDepth, maxNodes, caution, time };

  if (!history.length) {
    session = null;
    rapfi.sendCommand("INFO RULE 0");
    rapfi.sendCommand(`START ${size}`);
    applySettings(rapfi, settings);
    rapfi.sendCommand("BEGIN");
    move = parseMove();
    session = { size, aiColor, history: [] };
  } else if (extendsSession(size, history, aiColor)) {
    // 正常续弈：引擎内部已经有完整局面，只送对手最新一手。
    applySettings(rapfi, settings);
    const last = history[history.length - 1];
    rapfi.sendCommand(`TURN ${last.x},${last.y}`);
    move = parseMove();
  } else if (history.length === 1 && aiColor === 2) {
    // 引擎执白的第一手：用 TURN 建立「对手先手」，避免 BOARD 的颜色歧义。
    session = null;
    rapfi.sendCommand("INFO RULE 0");
    rapfi.sendCommand(`START ${size}`);
    applySettings(rapfi, settings);
    rapfi.sendCommand(`TURN ${history[0].x},${history[0].y}`);
    move = parseMove();
    session = { size, aiColor, history: [] };
  } else {
    // 新 Worker / 悔棋后重建：从完整历史重放一次。
    session = null;
    rapfi.sendCommand("INFO RULE 0");
    rapfi.sendCommand(`START ${size}`);
    applySettings(rapfi, settings);

    const lines = ["BOARD"];
    for (const item of history) {
      // 1 = 引擎自己，2 = 对手；不能直接传绝对的黑白。
      lines.push(`${item.x},${item.y},${item.color === aiColor ? 1 : 2}`);
    }
    lines.push("DONE");
    rapfi.sendCommand(lines.join("\n"));
    move = parseMove();
    session = { size, aiColor, history: [] };
  }

  if (!move) {
    throw new Error(`Rapfi 没有返回落子：${output.slice(-4).join(" | ")}`);
  }

  rememberMove(history, aiColor, move);
  return move;
}

async function computeHint({
  size,
  history,
  time,
  strength,
  maxDepth,
  maxNodes,
  caution,
  aiColor,
}) {
  const rapfi = await ensureEngine();
  output.length = 0;
  // 先废弃旧会话：即使这次建议失败，下一次 AI 也会从 BOARD 重建。
  session = null;
  const settings = { strength, maxDepth, maxNodes, caution, time };

  rapfi.sendCommand("INFO RULE 0");
  rapfi.sendCommand(`START ${size}`);
  applySettings(rapfi, settings);

  if (!history.length) {
    rapfi.sendCommand("BEGIN");
  } else {
    const lines = ["BOARD"];
    for (const item of history) {
      lines.push(`${item.x},${item.y},${item.color === aiColor ? 1 : 2}`);
    }
    lines.push("DONE");
    rapfi.sendCommand(lines.join("\n"));
  }

  const move = parseMove();
  // 建议不落子；会话已在开头清掉，避免下一次 AI 请求误以为这步已经下了。
  if (!move) {
    throw new Error(`Rapfi 军师没有返回落子：${output.slice(-4).join(" | ")}`);
  }
  return move;
}

async function computeAnalysis({
  size,
  history,
  time,
  strength,
  maxDepth,
  maxNodes,
  caution,
  aiColor,
}) {
  const rapfi = await ensureEngine();
  output.length = 0;
  session = null;
  const settings = { strength, maxDepth, maxNodes, caution, time };

  rapfi.sendCommand("INFO RULE 0");
  rapfi.sendCommand("INFO SHOW_DETAIL 2");
  rapfi.sendCommand(`START ${size}`);
  applySettings(rapfi, settings);

  if (!history.length) {
    rapfi.sendCommand("BEGIN");
  } else {
    const lines = ["BOARD"];
    for (const item of history) {
      lines.push(`${item.x},${item.y},${item.color === aiColor ? 1 : 2}`);
    }
    lines.push("DONE");
    rapfi.sendCommand(lines.join("\n"));
  }

  const move = parseMove();
  const evalScore = parseEval();
  const winRate = parseWinRate();
  const depth = parseDepth();
  if (!move && evalScore === null && winRate === null) {
    throw new Error(`Rapfi 形势分析没有返回结果：${output.slice(-4).join(" | ")}`);
  }

  return { move, eval: evalScore, winRate, depth };
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "init") {
      await ensureEngine();
      self.postMessage({ id, type: "ready" });
      return;
    }

    if (type === "move") {
      const move = await computeMove(payload);
      self.postMessage({ id, type: "move", move });
      return;
    }

    if (type === "hint") {
      const move = await computeHint(payload);
      self.postMessage({ id, type: "move", move });
      return;
    }

    if (type === "analyze") {
      const result = await computeAnalysis(payload);
      self.postMessage({ id, type: "analysis", ...result });
      return;
    }

    throw new Error(`未知消息类型：${type}`);
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: String(error && error.message ? error.message : error),
    });
  }
};
