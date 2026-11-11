import test from "node:test";
import assert from "node:assert/strict";

import { BLACK, EMPTY, Game, WHITE } from "../src/game.js?v=20261106-3";
import { chooseMove } from "../src/ai.js?v=20261106-3";

const LEVELS = ["novice", "easy", "normal", "hard", "master", "challenge"];

const isLegal = (game, move) =>
  move && game.get(move.x, move.y) === EMPTY && game.inBounds(move.x, move.y);

test("空棋盘从中心开局", () => {
  const game = new Game(15);
  const move = chooseMove(game, "normal");
  assert.deepEqual(move, { x: 7, y: 7 });
});

test("有直接连五时立即取胜", () => {
  const game = new Game(15);
  const moves = [
    [3, 7], [0, 0],
    [4, 7], [2, 0],
    [5, 7], [4, 0],
    [6, 7], [6, 0],
  ];
  for (const [x, y] of moves) game.play(x, y);
  assert.equal(game.current, BLACK);

  const move = chooseMove(game, "master");
  assert.ok(isLegal(game, move));
  assert.ok(
    (move.x === 2 && move.y === 7) || (move.x === 7 && move.y === 7),
    `应当落在 (2,7) 或 (7,7)，实际 (${move.x},${move.y})`,
  );
});

test("对方即将连五时必须封堵", () => {
  const game = new Game(15);
  const moves = [
    [0, 0], [3, 7],
    [2, 2], [4, 7],
    [4, 4], [5, 7],
    [6, 6], [6, 7],
  ];
  for (const [x, y] of moves) game.play(x, y);
  assert.equal(game.current, BLACK);

  const move = chooseMove(game, "normal");
  assert.ok(isLegal(game, move));
  assert.ok(
    (move.x === 2 && move.y === 7) || (move.x === 7 && move.y === 7),
    `应当封堵 (2,7) 或 (7,7)，实际 (${move.x},${move.y})`,
  );
});

test("高手会把开放三做成活四（算杀）", () => {
  const game = new Game(15);
  const moves = [
    [3, 7], [0, 0],
    [4, 7], [0, 2],
    [5, 7], [0, 4],
  ];
  for (const [x, y] of moves) game.play(x, y);
  assert.equal(game.current, BLACK);

  const move = chooseMove(game, "master");
  assert.ok(
    (move.x === 2 && move.y === 7) || (move.x === 6 && move.y === 7),
    `应当做成活四，实际 (${move.x},${move.y})`,
  );
});

test("所有难度都返回合法着法", () => {
  for (const level of LEVELS) {
    const game = new Game(15);
    game.play(7, 7);
    game.play(8, 8);
    game.play(6, 8);

    const move = chooseMove(game, level);
    assert.ok(isLegal(game, move), `${level} 返回了非法着法`);
    game.play(move.x, move.y);
  }
});

test("对局可以完整下完（13×13）", () => {
  const game = new Game(13);
  let guard = 0;
  while (!game.isOver && guard < 200) {
    const move = chooseMove(game, "easy");
    assert.ok(isLegal(game, move));
    game.play(move.x, move.y);
    guard += 1;
  }
  assert.ok(game.isOver, "对局应在 169 手内结束");
  assert.ok(guard <= 169);
});

test("AI 思考时间在预算量级内（15×15 中盘）", () => {
  const game = new Game(15);
  const opening = [
    [7, 7], [8, 8],
    [6, 6], [8, 6],
    [6, 8], [9, 9],
    [5, 7], [9, 7],
  ];
  for (const [x, y] of opening) game.play(x, y);

  const started = performance.now();
  const move = chooseMove(game, "master");
  const elapsed = performance.now() - started;

  assert.ok(isLegal(game, move));
  assert.ok(elapsed < 2000, `master 单步耗时 ${elapsed.toFixed(0)}ms 超出预期`);
});

test("白棋也能被正确评估（颜色视角）", () => {
  const game = new Game(15);
  // 黑先，摆成轮到白棋、白棋可直接连五的局面
  const moves = [
    [0, 0], [3, 7],
    [2, 0], [4, 7],
    [4, 0], [5, 7],
    [6, 0], [6, 7],
    [8, 0],
  ];
  for (const [x, y] of moves) game.play(x, y);
  assert.equal(game.current, WHITE);

  const move = chooseMove(game, "master");
  assert.ok(
    (move.x === 2 && move.y === 7) || (move.x === 7 && move.y === 7),
    `白棋应直接连五，实际 (${move.x},${move.y})`,
  );
});

const board = (black, white, current) => {
  const game = new Game(15);
  for (const [x, y] of black) game.cells[y * 15 + x] = BLACK;
  for (const [x, y] of white) game.cells[y * 15 + x] = WHITE;
  game.current = current;
  game.history = [{ x: 0, y: 0, color: BLACK }];
  return game;
};

test("普通/困难/高手会封堵四个方向的活三", () => {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const scatter = [[0, 0], [0, 7], [14, 0]];

  for (const [dx, dy] of dirs) {
    for (const human of [BLACK, WHITE]) {
      const humanPoints = [-1, 0, 1].map((k) => [7 + dx * k, 7 + dy * k]);
      const black = human === BLACK ? humanPoints : scatter;
      const white = human === WHITE ? humanPoints : scatter;
      const aiColor = human === BLACK ? WHITE : BLACK;

      for (const level of ["normal", "hard", "master"]) {
        const game = board(black, white, aiColor);
        const move = chooseMove(game, level);
        const blocked = [-2, 2].some(
          (k) => move.x === 7 + dx * k && move.y === 7 + dy * k,
        );
        assert.ok(
          blocked,
          `${level} 没有封堵方向 (${dx},${dy}) 的活三，实际 (${move.x},${move.y})`,
        );
      }
    }
  }
});

test("困难/高手会堵跳三的空隙", () => {
  const scatter = [[0, 0], [0, 7], [14, 0]];
  const patterns = [
    { offsets: [-1, 0, 2], gap: 1 },
    { offsets: [-1, 1, 2], gap: 0 },
  ];

  for (const { offsets, gap } of patterns) {
    const humanPoints = offsets.map((k) => [7 + k, 7]);
    const game = board(humanPoints, scatter, WHITE);
    for (const level of ["hard", "master"]) {
      const move = chooseMove(game, level);
      assert.ok(
        move.x === 7 + gap && move.y === 7,
        `${level} 没有堵跳三空隙 (${7 + gap},7)，实际 (${move.x},${move.y})`,
      );
    }
  }
});

test("密集局面里也不会漏掉活三", () => {
  // 6x6 周期条纹（四个方向最长连续 2 子），模拟中盘棋堆
  const cells = new Uint8Array(15 * 15);
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 1; x <= 6; x += 1) {
      cells[y * 15 + x] = (x + 2 * y) % 4 < 2 ? BLACK : WHITE;
    }
  }
  cells[12 * 15 + 3] = BLACK;
  cells[12 * 15 + 4] = BLACK;
  cells[12 * 15 + 5] = BLACK;
  cells[0 * 15 + 0] = WHITE;
  cells[7 * 15 + 0] = WHITE;
  cells[0 * 15 + 14] = WHITE;

  const game = new Game(15);
  game.cells.set(cells);
  game.current = WHITE;
  game.history = [{ x: 0, y: 0, color: BLACK }];

  for (const level of ["normal", "hard", "master"]) {
    const move = chooseMove(game, level);
    const blocked =
      (move.x === 2 && move.y === 12) || (move.x === 6 && move.y === 12);
    assert.ok(
      blocked,
      `${level} 在密集局面漏掉活三，实际 (${move.x},${move.y})`,
    );
  }
});

test("高手能算出双活三", () => {
  const game = board(
    [[5, 6], [7, 6], [6, 5], [6, 7]],
    [[0, 0], [0, 2], [14, 0], [0, 14]],
    BLACK,
  );
  const move = chooseMove(game, "master");
  assert.deepEqual(move, { x: 6, y: 6 });
});
