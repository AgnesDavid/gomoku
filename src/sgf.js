import { BLACK, WHITE } from "./game.js?v=20261106-3";

const SIZES = [13, 15, 19];
const MAX_SGF_CHARS = 1_000_000;

function sgfCoord(value) {
  return String.fromCharCode(97 + value);
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 只接受本游戏能重放的 SGF：
 * - 13/15/19 路；
 * - 黑白交替，从黑开始；
 * - 坐标在棋盘内；
 * - 最多铺满棋盘，避免恶意超长文件。
 *
 * 返回 { size, moves: [x, y, x, y, ...] }，与原棋谱库格式兼容。
 */
export function parseSgf(text) {
  const source = typeof text === "string" ? text : "";
  if (!source || source.length > MAX_SGF_CHARS) return null;

  const sizeMatch = source.match(/\bSZ\s*\[\s*(\d+)\s*\]/i);
  const size = sizeMatch ? Number(sizeMatch[1]) : 15;
  if (!SIZES.includes(size)) return null;

  const moves = [];
  let expected = BLACK;
  const regex = /;\s*([BW])\s*\[\s*([a-z])\s*([a-z])\s*\]/gi;
  let match;

  while ((match = regex.exec(source))) {
    const player = match[1].toUpperCase() === "B" ? BLACK : WHITE;
    if (player !== expected) return null;

    const x = match[2].toLowerCase().charCodeAt(0) - 97;
    const y = match[3].toLowerCase().charCodeAt(0) - 97;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;

    moves.push(x, y);
    if (moves.length > size * size * 2) return null;
    expected = player === BLACK ? WHITE : BLACK;
  }

  return moves.length ? { size, moves } : null;
}

/** 生成标准 SGF；winner 传 null 表示未结束，0 表示和棋。 */
export function buildSgf({ size, history, winner = null, date = new Date() }) {
  const result =
    winner === BLACK ? "B+" : winner === WHITE ? "W+" : winner === 0 ? "0" : "?";
  const dateText = typeof date === "string" ? date : localDate(date);
  const moves = history
    .map(
      (move) =>
        `;${move.player === BLACK ? "B" : "W"}[${sgfCoord(move.x)}${sgfCoord(move.y)}]`,
    )
    .join("");

  return `(;GM[1]FF[4]CA[UTF-8]AP[Gomoku]RU[Freestyle]SZ[${size}]DT[${dateText}]RE[${result}]${moves})`;
}
