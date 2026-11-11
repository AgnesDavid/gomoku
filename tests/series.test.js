import test from "node:test";
import assert from "node:assert/strict";

import { BLACK, WHITE } from "../src/game.js?v=20261106-3";
import {
  SERIES_GAMES,
  createSeries,
  playerForColor,
  recordSeriesGame,
  seriesOutcome,
} from "../src/series.js?v=20261106-3";

test("两局赛按选手计分，并让双方各执黑一次", () => {
  const series = createSeries("normal", "hard");
  assert.equal(series.a, "normal");
  assert.equal(series.b, "hard");
  assert.equal(series.games, 0);

  assert.equal(playerForColor(series, BLACK), "a");
  assert.equal(playerForColor(series, WHITE), "b");

  const afterFirst = recordSeriesGame(series, BLACK);
  assert.equal(afterFirst.games, 1);
  assert.equal(afterFirst.wins.a, 1);
  assert.equal(afterFirst.wins.b, 0);
  assert.equal(afterFirst.finished, false);

  assert.equal(playerForColor(afterFirst, BLACK), "b");
  assert.equal(playerForColor(afterFirst, WHITE), "a");

  const afterSecond = recordSeriesGame(afterFirst, BLACK);
  assert.equal(afterSecond.games, SERIES_GAMES);
  assert.equal(afterSecond.wins.a, 1);
  assert.equal(afterSecond.wins.b, 1);
  assert.equal(afterSecond.finished, true);
  assert.equal(seriesOutcome(afterSecond), "draw");
});

test("两局赛可以 2:0 结束，且不修改原对象", () => {
  const first = recordSeriesGame(createSeries("normal", "hard"), BLACK);
  const second = recordSeriesGame(first, WHITE);
  assert.equal(second.wins.a, 2);
  assert.equal(second.wins.b, 0);
  assert.equal(seriesOutcome(second), "a");
  assert.equal(first.games, 1);
  assert.equal(first.wins.a, 1);
});

test("和棋计入系列赛，但不会产生胜者", () => {
  const series = recordSeriesGame(createSeries("normal", "hard"), 0);
  assert.equal(series.draws, 1);
  assert.equal(series.games, 1);
  assert.equal(series.finished, false);
  assert.equal(seriesOutcome(series), null);

  const end = recordSeriesGame(series, 0);
  assert.equal(end.draws, 2);
  assert.equal(end.finished, true);
  assert.equal(seriesOutcome(end), "draw");
});

test("系列赛结束后不再计分", () => {
  const finished = recordSeriesGame(
    recordSeriesGame(createSeries("normal", "hard"), BLACK),
    WHITE,
  );
  assert.equal(recordSeriesGame(finished, BLACK), finished);
});
