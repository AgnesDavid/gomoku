import test from "node:test";
import assert from "node:assert/strict";

import { BLACK, WHITE, Game } from "../src/game.js?v=20261106-3";
import { describeHint } from "../src/advice.js?v=20261106-3";

function board(size = 15) {
  return new Game(size);
}

function put(game, player, points) {
  for (const [x, y] of points) game.cells[y * game.size + x] = player;
}

test("军师能识别直接成五", () => {
  const game = board();
  put(game, BLACK, [
    [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
  ]);
  assert.equal(describeHint(game, { x: 2, y: 7 }, BLACK), "直接成五");
  assert.equal(describeHint(game, { x: 7, y: 7 }, BLACK), "直接成五");
});

test("军师能识别堵对方成五", () => {
  const game = board();
  put(game, WHITE, [
    [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
  ]);
  assert.equal(describeHint(game, { x: 2, y: 7 }, BLACK), "堵对方成五");
});

test("军师能识别做活三和堵活三", () => {
  const game = board();
  put(game, BLACK, [
    [5, 7],
    [6, 7],
  ]);
  assert.equal(describeHint(game, { x: 7, y: 7 }, BLACK), "做成活三");

  const blocked = board();
  put(blocked, WHITE, [
    [5, 7],
    [6, 7],
  ]);
  assert.equal(describeHint(blocked, { x: 7, y: 7 }, BLACK), "堵活三");
});

test("军师判断不会改动棋盘", () => {
  const game = board();
  put(game, BLACK, [
    [5, 7],
    [6, 7],
  ]);
  const before = Array.from(game.cells);
  describeHint(game, { x: 7, y: 7 }, BLACK);
  assert.deepEqual(Array.from(game.cells), before);
});
