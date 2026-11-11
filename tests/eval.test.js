import test from "node:test";
import assert from "node:assert/strict";

import { BLACK, WHITE } from "../src/game.js?v=20261106-3";
import { estimateWinRates, terminalWinRates } from "../src/eval.js?v=20261106-3";

const near = (actual, expected, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("均势评分给出接近五五开", () => {
  const rates = estimateWinRates(0, BLACK);
  near(rates.black, 0.5);
  near(rates.white, 0.5);
});

test("正评分偏向当前行棋方", () => {
  const blackTurn = estimateWinRates(400, BLACK);
  near(blackTurn.black, 1 / (1 + Math.exp(-1)));
  near(blackTurn.white, 1 - 1 / (1 + Math.exp(-1)));

  const whiteTurn = estimateWinRates(400, WHITE);
  near(whiteTurn.white, 1 / (1 + Math.exp(-1)));
  near(whiteTurn.black, 1 - 1 / (1 + Math.exp(-1)));
});

test("负评分对当前行棋方不利", () => {
  const rates = estimateWinRates(-400, BLACK);
  near(rates.black, 1 / (1 + Math.exp(1)));
  near(rates.white, 1 - 1 / (1 + Math.exp(1)));
});

test("胜率被限制在 1%–99%", () => {
  const winning = estimateWinRates(99999, BLACK);
  assert.equal(winning.black, 0.99);
  const losing = estimateWinRates(-99999, BLACK);
  assert.equal(losing.black, 0.01);
});

test("终局胜率是确定的", () => {
  assert.deepEqual(terminalWinRates(BLACK), { black: 1, white: 0 });
  assert.deepEqual(terminalWinRates(WHITE), { black: 0, white: 1 });
  assert.deepEqual(terminalWinRates(0), { black: 0.5, white: 0.5 });
});
