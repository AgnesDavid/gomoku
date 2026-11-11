import { BLACK, WHITE } from "./game.js?v=20261106-3";

/**
 * 公平两局赛：双方各执黑一次，按“选手”而不是颜色计分。
 *
 * A = 第一局执黑的一方，B = 第一局执白的一方。
 * 第一局：黑 A / 白 B；第二局：黑 B / 白 A。
 * 两局结束即定胜负，1:1 记平局，不设第三局，避免一方多拿一次先手。
 */
export const SERIES_GAMES = 2;

export function createSeries(aLevel, bLevel) {
  return {
    a: aLevel,
    b: bLevel,
    wins: { a: 0, b: 0 },
    draws: 0,
    games: 0,
    finished: false,
  };
}

/** 当前这一局里，某个颜色对应 A 还是 B。 */
export function playerForColor(series, color) {
  if (!series || (color !== BLACK && color !== WHITE)) return null;
  const evenGame = series.games % 2 === 0;
  if (color === BLACK) return evenGame ? "a" : "b";
  return evenGame ? "b" : "a";
}

/** 记录一局结果。winner 为 0 表示和棋；返回新对象，不修改原状态。 */
export function recordSeriesGame(series, winner) {
  if (!series || series.finished) return series;

  const next = {
    ...series,
    wins: { ...series.wins },
    games: series.games + 1,
  };

  if (winner === BLACK || winner === WHITE) {
    const player = playerForColor(series, winner);
    next.wins[player] += 1;
  } else {
    next.draws += 1;
  }

  next.finished = next.games >= SERIES_GAMES;
  return next;
}

/** 两局结束后的胜者："a" / "b" / "draw"；未结束返回 null。 */
export function seriesOutcome(series) {
  if (!series || !series.finished) return null;
  if (series.wins.a > series.wins.b) return "a";
  if (series.wins.b > series.wins.a) return "b";
  return "draw";
}
