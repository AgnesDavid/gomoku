import { BLACK, WHITE } from "./game.js?v=20261106-3";

/**
 * 把引擎评分换算成“估算胜率”。
 *
 * Rapfi 的 Eval 是给当前行棋方的分数，单位近似厘兵；这里用 logistic
 * 映射成 0–100%。它不是严格校准过的统计胜率，只适合做形势条。
 */
const SCALE = 400;

export function estimateWinRates(evalScore, turn) {
  let sideToMove = 0.5;
  if (Number.isFinite(evalScore)) {
    sideToMove = 1 / (1 + Math.exp(-evalScore / SCALE));
  }
  sideToMove = Math.min(0.99, Math.max(0.01, sideToMove));

  return turn === BLACK
    ? { black: sideToMove, white: 1 - sideToMove }
    : { black: 1 - sideToMove, white: sideToMove };
}

export function terminalWinRates(winner) {
  if (winner === BLACK) return { black: 1, white: 0 };
  if (winner === WHITE) return { black: 0, white: 1 };
  return { black: 0.5, white: 0.5 };
}
