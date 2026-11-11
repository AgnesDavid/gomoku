import test from "node:test";
import assert from "node:assert/strict";

import { BLACK, WHITE, Game, findWinLine } from "../src/game.js?v=20261106-3";

function playMoves(game, moves) {
  for (const [x, y] of moves) {
    const result = game.play(x, y);
    assert.equal(result.ok, true, `落子 (${x}, ${y}) 应当合法`);
  }
}

test("横向五连获胜，并返回完整连线", () => {
  const game = new Game(15);
  playMoves(game, [
    [3, 7], [0, 0],
    [4, 7], [0, 2],
    [5, 7], [0, 4],
    [6, 7], [0, 6],
    [7, 7],
  ]);
  assert.equal(game.winner, BLACK);
  assert.equal(game.isOver, true);
  assert.equal(game.winLine.length, 5);
  assert.deepEqual(game.winLine[0], { x: 3, y: 7 });
  assert.deepEqual(game.winLine[4], { x: 7, y: 7 });
});

test("纵向与两条斜线都能判胜", () => {
  const vertical = new Game(15);
  playMoves(vertical, [
    [7, 3], [0, 0],
    [7, 4], [0, 2],
    [7, 5], [0, 4],
    [7, 6], [0, 6],
    [7, 7],
  ]);
  assert.equal(vertical.winner, BLACK);

  const diagonal = new Game(15);
  playMoves(diagonal, [
    [3, 3], [0, 0],
    [4, 4], [0, 2],
    [5, 5], [0, 4],
    [6, 6], [0, 6],
    [7, 7],
  ]);
  assert.equal(diagonal.winner, BLACK);

  const antiDiagonal = new Game(15);
  playMoves(antiDiagonal, [
    [3, 11], [0, 0],
    [4, 10], [0, 2],
    [5, 9], [0, 4],
    [6, 8], [0, 6],
    [7, 7],
  ]);
  assert.equal(antiDiagonal.winner, BLACK);
});

test("四子不判胜，五子以上（长连）判胜", () => {
  const four = new Game(15);
  playMoves(four, [
    [3, 7], [0, 0],
    [4, 7], [0, 2],
    [5, 7], [0, 4],
    [6, 7],
  ]);
  assert.equal(four.winner, 0);
  assert.equal(four.isOver, false);

  const overline = new Game(15);
  playMoves(overline, [
    [3, 7], [0, 0],
    [4, 7], [2, 0],
    [5, 7], [4, 0],
    [6, 7], [6, 0],
    [8, 7], [8, 0],
    [7, 7],
  ]);
  assert.equal(overline.winner, BLACK);
  assert.equal(overline.winLine.length, 6);
});

test("边界上的五连不会越界误判", () => {
  const game = new Game(15);
  playMoves(game, [
    [0, 0], [14, 14],
    [1, 0], [14, 12],
    [2, 0], [14, 10],
    [3, 0], [14, 8],
    [4, 0],
  ]);
  assert.equal(game.winner, BLACK);
  assert.equal(findWinLine(game.cells, 15, 4, 0, BLACK).length, 5);
});

test("非法落子被拒绝，且不改变状态", () => {
  const game = new Game(15);
  game.play(7, 7);
  const before = game.history.length;

  assert.equal(game.play(7, 7).ok, false);
  assert.equal(game.play(-1, 0).ok, false);
  assert.equal(game.play(0, 15).ok, false);
  assert.equal(game.history.length, before);
  assert.equal(game.current, WHITE);
});

test("悔棋恢复棋盘与行棋方", () => {
  const game = new Game(15);
  game.play(7, 7);
  game.play(8, 8);
  assert.equal(game.current, BLACK);

  const move = game.undoLast();
  assert.deepEqual(move, { x: 8, y: 8, player: WHITE });
  assert.equal(game.get(8, 8), 0);
  assert.equal(game.current, WHITE);
  assert.equal(game.history.length, 1);
});

test("悔棋可以撤销胜利状态", () => {
  const game = new Game(13);
  playMoves(game, [
    [1, 1], [0, 0],
    [2, 1], [0, 2],
    [3, 1], [0, 4],
    [4, 1], [0, 6],
    [5, 1],
  ]);
  assert.equal(game.winner, BLACK);

  game.undoLast();
  assert.equal(game.winner, 0);
  assert.equal(game.winLine, null);
  assert.equal(game.isOver, false);
  assert.equal(game.current, BLACK);
  assert.equal(game.get(5, 1), 0);
});

test("不同棋盘尺寸下都能正确判胜", () => {
  for (const size of [13, 15, 19]) {
    const game = new Game(size);
    const y = size >> 1;
    const start = (size >> 1) - 2;
    const moves = [];
    for (let i = 0; i < 5; i += 1) {
      moves.push([start + i, y]);
      if (i < 4) moves.push([0, i * 2]);
    }
    playMoves(game, moves);
    assert.equal(game.winner, BLACK, `尺寸 ${size} 应当判胜`);
    assert.equal(game.winLine.length, 5);
  }
});
