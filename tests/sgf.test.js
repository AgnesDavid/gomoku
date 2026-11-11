import test from "node:test";
import assert from "node:assert/strict";

import { BLACK, WHITE } from "../src/game.js?v=20261106-3";
import { buildSgf, parseSgf } from "../src/sgf.js?v=20261106-3";

test("解析标准 SGF 并保留坐标", () => {
  const parsed = parseSgf("(;GM[1]SZ[15];B[hh];W[hi];B[ih])");
  assert.deepEqual(parsed, { size: 15, moves: [7, 7, 7, 8, 8, 7] });
});

test("拒绝非 13/15/19 路和无棋子的 SGF", () => {
  assert.equal(parseSgf("(;GM[1]SZ[9];B[aa])"), null);
  assert.equal(parseSgf("(;GM[1]SZ[15])"), null);
});

test("拒绝颜色不交替、越界和超长棋谱", () => {
  assert.equal(parseSgf("(;SZ[15];B[aa];B[bb])"), null);
  assert.equal(parseSgf("(;SZ[13];B[aa];W[nn])"), null);

  const tooMany = Array.from({ length: 170 }, (_, index) =>
    `;${index % 2 === 0 ? "B" : "W"}[aa]`,
  ).join("");
  assert.equal(parseSgf(`(;SZ[13]${tooMany})`), null);
});

test("导出 SGF 包含规则、结果和黑白落子", () => {
  const sgf = buildSgf({
    size: 13,
    winner: BLACK,
    date: "2026-11-05",
    history: [
      { x: 6, y: 6, player: BLACK },
      { x: 7, y: 7, player: WHITE },
    ],
  });
  assert.match(sgf, /RU\[Freestyle\]/);
  assert.match(sgf, /SZ\[13\]/);
  assert.match(sgf, /DT\[2026-11-05\]/);
  assert.match(sgf, /RE\[B\+\]/);
  assert.match(sgf, /;B\[gg\];W\[hh\]/);
});

test("未结束与和棋的结果标记正确", () => {
  const ongoing = buildSgf({ size: 15, history: [], winner: null, date: "2026-11-05" });
  const draw = buildSgf({ size: 15, history: [], winner: 0, date: "2026-11-05" });
  assert.match(ongoing, /RE\[\?\]/);
  assert.match(draw, /RE\[0\]/);
});
