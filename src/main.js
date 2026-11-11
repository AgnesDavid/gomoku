import { BLACK, EMPTY, Game, WHITE } from "./game.js?v=20261106-3";
import { chooseMove } from "./ai.js?v=20261106-3";
import { RapfiAI } from "./rapfi-ai.js?v=20261106-3";
import { JsAI } from "./js-ai.js?v=20261106-3";
import { BoardRenderer } from "./renderer.js?v=20261106-3";
import { describeHint } from "./advice.js?v=20261106-3";
import { estimateWinRates, terminalWinRates } from "./eval.js?v=20261106-3";
import { initTheme } from "./theme.js?v=20261106-3";
import { initSound, playStoneSound } from "./sound.js?v=20261106-3";
import { initPWA } from "./pwa.js?v=20261106-3";
import { buildSgf, parseSgf } from "./sgf.js?v=20261106-3";
import {
  createSeries,
  recordSeriesGame,
  seriesOutcome,
} from "./series.js?v=20261106-3";

const LEVEL_NOTES = {
  novice: "刚学会规则，会下错",
  easy: "攻守均衡，适合日常",
  normal: "会算杀，接近旧版高手",
  hard: "轻量 WASM，短考",
  master: "WASM 中长考，更强",
  challenge: "5 秒长考，挑战极限",
};

const LEVEL_LABELS = {
  novice: "新手",
  easy: "简单",
  normal: "普通",
  hard: "困难",
  master: "高手",
  challenge: "挑战",
};

const SIZES = [13, 15, 19];
const STORAGE_KEY = "gomoku.settings.v1";
const SAVE_KEY = "gomoku.save.v1";
const STATS_KEY = "gomoku.stats.v1";
const LIBRARY_KEY = "gomoku.library.v1";
const SAVE_VERSION = 1;

const canvas = document.querySelector("#board");
const renderer = new BoardRenderer(canvas);
const rapfi = new RapfiAI();
const hintRapfi = new RapfiAI({ idleRelease: true });
const jsAI = new JsAI();

const els = {
  statusCard: document.querySelector("#statusCard"),
  statusStone: document.querySelector("#statusStone"),
  statusTitle: document.querySelector("#statusTitle"),
  statusSub: document.querySelector("#statusSub"),
  levelGroup: document.querySelector("#levelGroup"),
  levelNote: document.querySelector("#levelNote"),
  modeGroup: document.querySelector("#modeGroup"),
  modeNote: document.querySelector("#modeNote"),
  difficultyControl: document.querySelector("#difficultyControl"),
  sideField: document.querySelector("#sideField"),
  boardSize: document.querySelector("#boardSize"),
  side: document.querySelector("#side"),
  restart: document.querySelector("#restart"),
  undo: document.querySelector("#undo"),
  hint: document.querySelector("#hint"),
  demo: document.querySelector("#demo"),
  demoConfig: document.querySelector("#demoConfig"),
  demoSummary: document.querySelector("#demoSummary"),
  demoBlack: document.querySelector("#demoBlack"),
  demoWhite: document.querySelector("#demoWhite"),
  twoGameSeries: document.querySelector("#twoGameSeries"),
  swapDemo: document.querySelector("#swapDemo"),
  seriesScore: document.querySelector("#seriesScore"),
  boardMeta: document.querySelector("#boardMeta"),
  srStatus: document.querySelector("#srStatus"),
  evalBody: document.querySelector("#evalBody"),
  evalBar: document.querySelector("#evalBar"),
  evalBlackBar: document.querySelector("#evalBlackBar"),
  evalWhiteBar: document.querySelector("#evalWhiteBar"),
  evalBlackLabel: document.querySelector("#evalBlackLabel"),
  evalWhiteLabel: document.querySelector("#evalWhiteLabel"),
  evalMeta: document.querySelector("#evalMeta"),
  evalNote: document.querySelector("#evalNote"),
  analysisTime: document.querySelector("#analysisTime"),
  analyze: document.querySelector("#analyze"),
  autoAnalyze: document.querySelector("#autoAnalyze"),
  humanRecord: document.querySelector("#humanRecord"),
  demoRecord: document.querySelector("#demoRecord"),
  exportSgf: document.querySelector("#exportSgf"),
  share: document.querySelector("#share"),
  importSgfButton: document.querySelector("#importSgfButton"),
  importSgf: document.querySelector("#importSgf"),
  saveSgf: document.querySelector("#saveSgf"),
  deleteSgf: document.querySelector("#deleteSgf"),
  sgfLibrary: document.querySelector("#sgfLibrary"),
  libraryCount: document.querySelector("#libraryCount"),
  review: document.querySelector("#review"),
  reviewBar: document.querySelector("#reviewBar"),
  reviewPrev: document.querySelector("#reviewPrev"),
  reviewNext: document.querySelector("#reviewNext"),
  reviewExit: document.querySelector("#reviewExit"),
  reviewLabel: document.querySelector("#reviewLabel"),
  magnifier: document.querySelector("#magnifier"),
  magnifierCanvas: document.querySelector("#magnifierCanvas"),
  resultOverlay: document.querySelector("#resultOverlay"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSub: document.querySelector("#resultSub"),
  resultRestart: document.querySelector("#resultRestart"),
  resultUndo: document.querySelector("#resultUndo"),
  resultClose: document.querySelector("#resultClose"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  confirmOk: document.querySelector("#confirmOk"),
  confirmCancel: document.querySelector("#confirmCancel"),
};

const state = {
  difficulty: "normal",
  human: BLACK,
  local: false,
  thinking: false,
  hinting: false,
  hintCell: null,
  hintReason: "",
  engineLoading: false,
  aiEngine: null,
  aiRun: 0,
  aiTimer: 0,
  game: new Game(15),
  demo: false,
  demoPaused: false,
  demoLevels: { black: "normal", white: "normal" },
  twoGameSeries: false,
  demoSeries: null,
  cursor: { x: 7, y: 7 },
  resultOpen: false,
  resultDismissed: false,
  confirmAction: null,
  review: null,
  lastMoveAt: 0,
  analyzing: false,
  analysis: null,
  analysisError: false,
  autoAnalyze: false,
  analysisTime: 800,
  analysisRun: 0,
  analysisTimer: 0,
  stats: null,
  resultRecorded: false,
  library: [],
  touchCell: null,
  touchPointerId: null,
};

const aiColor = () => (state.human === BLACK ? WHITE : BLACK);
const colorName = (color) => (color === BLACK ? "黑" : "白");
const stoneName = (color) => (color === BLACK ? "black" : "white");
const labelOf = (cell) => `${String.fromCharCode(65 + cell.x)}${cell.y + 1}`;
const isLevel = (value) => Object.prototype.hasOwnProperty.call(LEVEL_NOTES, value);

function validSeries(value) {
  if (!value || typeof value !== "object") return false;
  if (!isLevel(value.a) || !isLevel(value.b)) return false;
  if (!Number.isInteger(value.games) || value.games < 0 || value.games > 2) return false;
  if (!value.wins || typeof value.wins !== "object") return false;
  if (
    !Number.isInteger(value.wins.a) ||
    !Number.isInteger(value.wins.b) ||
    value.wins.a < 0 ||
    value.wins.b < 0 ||
    value.wins.a + value.wins.b > value.games
  ) {
    return false;
  }
  if (!Number.isInteger(value.draws) || value.draws < 0 || value.draws > value.games) {
    return false;
  }
  if (value.wins.a + value.wins.b + value.draws !== value.games) return false;
  if (typeof value.finished !== "boolean") return false;
  return value.finished === (value.games >= 2);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        level: state.difficulty,
        size: state.game.size,
        side: state.human === BLACK ? "black" : "white",
        local: state.local,
        demoBlack: state.demoLevels.black,
        demoWhite: state.demoLevels.white,
        autoAnalyze: state.autoAnalyze,
        analysisTime: state.analysisTime,
        twoGameSeries: state.twoGameSeries,
      }),
    );
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略即可。
  }
}

function saveGame() {
  try {
    const game = state.game;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        v: SAVE_VERSION,
        size: game.size,
        human: state.human,
        difficulty: state.difficulty,
        local: state.local,
        demo: state.demo,
        demoPaused: state.demoPaused,
        demoBlack: state.demoLevels.black,
        demoWhite: state.demoLevels.white,
        twoGameSeries: state.twoGameSeries,
        demoSeries: state.demoSeries,
        history: game.history.map((move) => ({
          x: move.x,
          y: move.y,
          player: move.player,
        })),
      }),
    );
  } catch {
    // 忽略存储失败，游戏仍可继续。
  }
}

function loadStats() {
  const empty = { human: {}, demo: { black: 0, white: 0, draw: 0 } };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return empty;
    const stats = { human: {}, demo: { black: 0, white: 0, draw: 0 } };
    for (const level of Object.keys(LEVEL_NOTES)) {
      const rec = data.human && data.human[level];
      if (rec && typeof rec === "object") {
        stats.human[level] = {
          w: Number(rec.w) || 0,
          l: Number(rec.l) || 0,
          d: Number(rec.d) || 0,
        };
      }
    }
    for (const key of ["black", "white", "draw"]) {
      stats.demo[key] = Number(data.demo && data.demo[key]) || 0;
    }
    return stats;
  } catch {
    return empty;
  }
}

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
  } catch {
    // 忽略存储失败。
  }
}

function updateStatsUI() {
  if (!state.stats) return;
  if (state.local) {
    els.humanRecord.textContent = "本地双人 · 不计战绩";
    els.demoRecord.textContent = "—";
  } else {
    const rec = state.stats.human[state.difficulty] || { w: 0, l: 0, d: 0 };
    els.humanRecord.textContent = `${rec.w} 胜 ${rec.l} 负${
      rec.d ? ` ${rec.d} 和` : ""
    }`;
    const demo = state.stats.demo;
    els.demoRecord.textContent = `黑 ${demo.black} · 白 ${demo.white} · 和 ${demo.draw}`;
  }
  els.exportSgf.disabled = state.game.history.length === 0;
  if (els.saveSgf) els.saveSgf.disabled = state.game.history.length === 0;
}

function exportSgf() {
  const game = state.game;
  if (!game.history.length) return;

  const sgf = buildSgf({
    size: game.size,
    history: game.history,
    winner: game.isOver ? game.winner : null,
  });
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([sgf], { type: "application/x-go-sgf;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gomoku-${date}.sgf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canReplayMoves(size, moves) {
  const game = new Game(size);
  for (let i = 0; i < moves.length; i += 2) {
    if (!game.play(moves[i], moves[i + 1]).ok) return false;
  }
  return true;
}

function loadLibrary() {
  try {
    const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item) =>
          item &&
          typeof item.name === "string" &&
          item.name.length <= 120 &&
          SIZES.includes(item.size) &&
          Array.isArray(item.moves) &&
          item.moves.length > 0 &&
          item.moves.length % 2 === 0 &&
          item.moves.length <= item.size * item.size * 2 &&
          item.moves.every((value) => Number.isInteger(value)) &&
          canReplayMoves(item.size, item.moves),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(state.library));
  } catch {
    // 忽略存储失败。
  }
}

function updateLibraryUI() {
  if (!els.sgfLibrary) return;
  const selected = els.sgfLibrary.value;
  els.libraryCount.textContent = String(state.library.length);
  els.sgfLibrary.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "选择棋谱";
  els.sgfLibrary.append(placeholder);
  state.library.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${item.name} · ${item.size}路`;
    els.sgfLibrary.append(option);
  });
  if (state.library[Number(selected)]) els.sgfLibrary.value = selected;
  if (els.deleteSgf) els.deleteSgf.disabled = els.sgfLibrary.value === "";
}

function saveCurrentToLibrary() {
  const game = state.game;
  if (!game.history.length) return;

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  const suggested = `本局 · ${game.size}路 · ${stamp}`;
  const input = window.prompt("保存到棋谱库，输入名称：", suggested);
  if (input === null) return;
  const name = input.trim().slice(0, 120) || suggested;

  state.library.unshift({
    name,
    size: game.size,
    moves: game.history.flatMap((move) => [move.x, move.y]),
  });
  state.library = state.library.slice(0, 20);
  saveLibrary();
  updateLibraryUI();
  els.sgfLibrary.value = "0";
  els.deleteSgf.disabled = false;
  els.saveSgf.textContent = "已保存";
  window.setTimeout(() => {
    els.saveSgf.textContent = "保存本局";
  }, 1200);
}

function deleteLibraryItem() {
  const index = Number(els.sgfLibrary.value);
  if (!Number.isInteger(index) || !state.library[index]) return;
  state.library.splice(index, 1);
  saveLibrary();
  els.sgfLibrary.value = "";
  updateLibraryUI();
}

function loadLibraryItem(index) {
  const item = state.library[index];
  if (!item) return;

  clearShareHash();
  if (state.thinking || state.hinting || state.analyzing) cancelAI();
  else invalidateAI();

  const game = new Game(item.size);
  for (let i = 0; i < item.moves.length; i += 2) {
    if (game.play(item.moves[i], item.moves[i + 1]).ok === false) {
      window.alert("这个棋谱无法重放，可能已损坏。");
      return;
    }
  }

  state.game = game;
  state.human = BLACK;
  state.demo = false;
  state.demoPaused = false;
  state.demoSeries = null;
  state.resultRecorded = game.isOver;
  clearReview();
  clearAnalysis();
  clearHint();
  els.boardSize.value = String(game.size);
  els.side.value = "black";
  renderer.setGame(game);
  updateStatus();
  saveGame();
  startReview();
}

async function importSgfFile(file) {
  if (!file) return;
  try {
    const parsed = parseSgf(await file.text());
    if (!parsed || !canReplayMoves(parsed.size, parsed.moves)) {
      window.alert("没有识别到有效的 SGF 棋谱。");
      return;
    }
    state.library.unshift({
      name: (file.name.replace(/\.(sgf|txt)$/i, "") || "未命名棋谱").slice(0, 120),
      size: parsed.size,
      moves: parsed.moves,
    });
    state.library = state.library.slice(0, 20);
    saveLibrary();
    updateLibraryUI();
    els.sgfLibrary.value = "0";
    els.deleteSgf.disabled = false;
    loadLibraryItem(0);
  } catch {
    window.alert("读取 SGF 失败。");
  }
}

function buildShareUrl() {
  const payload = {
    v: 1,
    size: state.game.size,
    human: state.human,
    difficulty: state.difficulty,
    local: state.local,
    demo: state.demo,
    demoBlack: state.demoLevels.black,
    demoWhite: state.demoLevels.white,
    moves: state.game.history.flatMap((move) => [move.x, move.y]),
  };
  return `${location.origin}${location.pathname}${location.search}#g=${encodeURIComponent(
    JSON.stringify(payload),
  )}`;
}

async function sharePosition() {
  if (!state.game.history.length) return;
  const url = buildShareUrl();

  if (navigator.share) {
    try {
      await navigator.share({ title: "五子棋局面", url });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    els.share.textContent = "已复制";
    window.setTimeout(() => {
      els.share.textContent = "分享局面";
    }, 1200);
  } catch {
    window.prompt("复制下面的局面链接", url);
  }
}

function clearShareHash() {
  if (location.hash.startsWith("#g=")) {
    window.history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
}

function loadSharedPosition() {
  if (!location.hash.startsWith("#g=")) return false;

  let data;
  try {
    data = JSON.parse(decodeURIComponent(location.hash.slice(3)));
  } catch {
    return false;
  }

  if (
    !data ||
    data.v !== 1 ||
    !SIZES.includes(data.size) ||
    (data.human !== BLACK && data.human !== WHITE) ||
    !isLevel(data.difficulty) ||
    !Array.isArray(data.moves) ||
    data.moves.length % 2 !== 0 ||
    data.moves.length > data.size * data.size * 2
  ) {
    return false;
  }

  const game = new Game(data.size);
  for (let i = 0; i < data.moves.length; i += 2) {
    if (!Number.isInteger(data.moves[i]) || !Number.isInteger(data.moves[i + 1])) return false;
    const result = game.play(data.moves[i], data.moves[i + 1]);
    if (!result.ok) return false;
  }

  state.game = game;
  state.human = data.human;
  state.difficulty = data.difficulty;
  state.local = data.local === true;
  state.demo = !state.local && Boolean(data.demo);
  state.demoPaused = false;
  state.demoSeries = null;
  state.demoLevels = {
    black: isLevel(data.demoBlack) ? data.demoBlack : data.difficulty,
    white: isLevel(data.demoWhite) ? data.demoWhite : data.difficulty,
  };
  state.thinking = false;
  state.hinting = false;
  state.engineLoading = false;
  state.resultDismissed = false;
  state.resultRecorded = game.isOver;
  clearReview();
  clearAnalysis();
  clearHint();

  els.boardSize.value = String(game.size);
  els.side.value = state.human === BLACK ? "black" : "white";
  applyDifficultyUI(state.difficulty);
  updateModeUI();
  updateDemoControls();
  renderer.setGame(game);
  renderer.setHint(null);
  updateStatus();
  saveGame();

  if (game.isOver) {
    showTerminalEval();
    showResult();
  } else if (isAITurn()) {
    scheduleAI();
  }

  return true;
}

function recordResult() {
  const game = state.game;
  if (!game.isOver || state.resultRecorded || !state.stats) return;
  state.resultRecorded = true;

  if (state.local) {
    updateStatsUI();
    return;
  }

  if (state.demo) {
    if (game.winner === BLACK) state.stats.demo.black += 1;
    else if (game.winner === WHITE) state.stats.demo.white += 1;
    else state.stats.demo.draw += 1;

    if (state.demoSeries && !state.demoSeries.finished) {
      state.demoSeries = recordSeriesGame(state.demoSeries, game.winner);
      updateSeriesUI();
    }
  } else {
    const rec =
      state.stats.human[state.difficulty] ||
      (state.stats.human[state.difficulty] = { w: 0, l: 0, d: 0 });
    if (game.winner === state.human) rec.w += 1;
    else if (game.winner) rec.l += 1;
    else rec.d += 1;
  }

  saveStats();
  updateStatsUI();
}

function applyDifficultyUI(level) {
  state.difficulty = level;
  els.levelNote.textContent = LEVEL_NOTES[level] || "";
  for (const button of els.levelGroup.querySelectorAll("button")) {
    const active = button.dataset.level === level;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  updateStatsUI();
}

function updateModeUI() {
  for (const button of els.modeGroup.querySelectorAll("button")) {
    const active = button.dataset.mode === (state.local ? "local" : "ai");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  els.modeNote.textContent = state.local ? "本地双人" : "人机";
  els.sideField.hidden = state.local;
  els.sideField.closest(".control-row")?.classList.toggle("is-single", state.local);
  els.difficultyControl.hidden = state.local;
  els.demoConfig.hidden = state.local;
  els.autoAnalyze.disabled = state.local;
  updateStatsUI();
}

function updateDemoControls() {
  const black = LEVEL_LABELS[state.demoLevels.black] || "普通";
  const white = LEVEL_LABELS[state.demoLevels.white] || "普通";
  els.demoBlack.value = state.demoLevels.black;
  els.demoWhite.value = state.demoLevels.white;
  els.demoSummary.textContent = `${black} vs ${white}`;

  const locked = Boolean(state.demoSeries && !state.demoSeries.finished);
  els.demoBlack.disabled = locked;
  els.demoWhite.disabled = locked;
  els.swapDemo.disabled = locked;
  els.twoGameSeries.disabled = state.demo && !state.game.isOver;

  updateSeriesUI();
}

function updateSeriesUI() {
  els.twoGameSeries.checked = state.twoGameSeries;
  const series = state.demoSeries;
  if (!series) {
    els.seriesScore.textContent = state.twoGameSeries ? "A 0 : 0 B" : "0 : 0";
    els.seriesScore.title = state.twoGameSeries
      ? "开启两局赛，开始演示后计分"
      : "开启两局赛后计分";
    return;
  }

  const a = LEVEL_LABELS[series.a] || "A";
  const b = LEVEL_LABELS[series.b] || "B";
  els.seriesScore.textContent = `A ${series.wins.a} : ${series.wins.b} B${
    series.draws ? ` · 和 ${series.draws}` : ""
  }`;
  const outcome = seriesOutcome(series);
  els.seriesScore.title = `${a}（A） vs ${b}（B） · 两局各执黑一次${
    outcome === "draw" ? " · 平局" : outcome ? ` · ${outcome === "a" ? a : b} 获胜` : ""
  }`;
}

function demoLevelFor(color) {
  return color === BLACK ? state.demoLevels.black : state.demoLevels.white;
}

function restoreGame() {
  let data;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch {
    return false;
  }

  if (
    !data ||
    data.v !== SAVE_VERSION ||
    !SIZES.includes(data.size) ||
    !Array.isArray(data.history) ||
    (data.human !== BLACK && data.human !== WHITE) ||
    !isLevel(data.difficulty)
  ) {
    return false;
  }

  const game = new Game(data.size);
  for (const move of data.history) {
    if (
      !move ||
      !Number.isInteger(move.x) ||
      !Number.isInteger(move.y) ||
      (move.player !== BLACK && move.player !== WHITE)
    ) {
      return false;
    }
    const expected = game.current;
    const result = game.play(move.x, move.y);
    if (!result.ok || game.lastMove.player !== expected) return false;
  }

  if (game.history.length !== data.history.length) return false;

  state.game = game;
  state.human = data.human;
  state.difficulty = data.difficulty;
  state.local = typeof data.local === "boolean" ? data.local : state.local;
  state.demo = !state.local && Boolean(data.demo);
  state.demoPaused = state.demo && Boolean(data.demoPaused);
  if (typeof data.twoGameSeries === "boolean") state.twoGameSeries = data.twoGameSeries;
  if (isLevel(data.demoBlack)) state.demoLevels.black = data.demoBlack;
  if (isLevel(data.demoWhite)) state.demoLevels.white = data.demoWhite;
  state.demoSeries =
    state.demo && state.twoGameSeries && validSeries(data.demoSeries)
      ? data.demoSeries
      : null;
  state.thinking = false;
  state.hinting = false;
  state.engineLoading = false;
  state.hintCell = null;
  state.hintReason = "";
  state.resultDismissed = false;
  state.resultRecorded = game.isOver;
  clearReview();
  clearAnalysis();

  els.boardSize.value = String(game.size);
  els.side.value = state.human === BLACK ? "black" : "white";
  applyDifficultyUI(state.difficulty);
  updateModeUI();
  updateDemoControls();
  resetCursor(false);
  renderer.setGame(game);
  renderer.setHint(null);
  updateStatus();

  if (game.isOver) {
    showTerminalEval();
    showResult();
  } else {
    if (state.autoAnalyze && !state.demo) scheduleAutoAnalysis(320);
    if (isAITurn()) scheduleAI();
  }

  return true;
}

function canHumanPlay() {
  if (state.local) {
    return (
      !state.demo &&
      !state.review &&
      !state.thinking &&
      !state.hinting &&
      !state.game.isOver
    );
  }
  return (
    !state.demo &&
    !state.review &&
    !state.thinking &&
    !state.hinting &&
    !state.game.isOver &&
    state.game.current === state.human
  );
}

function canHint() {
  return (
    !state.demo &&
    !state.review &&
    !state.thinking &&
    !state.hinting &&
    !state.analyzing &&
    !state.game.isOver &&
    (state.local || state.game.current === state.human)
  );
}

function canAnalyze() {
  return (
    !state.review &&
    !state.analyzing &&
    !state.hinting &&
    !state.thinking &&
    !state.demo &&
    !state.game.isOver
  );
}

function isAITurn() {
  if (state.review || state.game.isOver || state.local) return false;
  if (state.demo) return !state.demoPaused;
  return state.game.current !== state.human;
}

function isPlayable(cell) {
  return state.game.get(cell.x, cell.y) === EMPTY;
}

function clearHint() {
  state.hintCell = null;
  state.hintReason = "";
  renderer.setHint(null);
}

function hideMagnifier() {
  state.touchCell = null;
  state.touchPointerId = null;
  els.magnifier.hidden = true;
}

function showMagnifier(cell, clientX, clientY) {
  const size = 120;
  const margin = 8;
  const left = Math.min(
    window.innerWidth - size - margin,
    Math.max(margin, clientX - size / 2),
  );
  let top = clientY - size - 24;
  if (top < margin) top = clientY + 24;
  els.magnifier.style.left = `${left}px`;
  els.magnifier.style.top = `${Math.min(top, window.innerHeight - size - margin)}px`;
  els.magnifier.hidden = false;
  renderer.drawMagnifier(els.magnifierCanvas, cell);
}

function clearAnalysis() {
  const wasAnalyzing = state.analyzing;
  state.analysisRun += 1;
  state.analysis = null;
  state.analysisError = false;
  state.analyzing = false;
  if (state.analysisTimer) {
    clearTimeout(state.analysisTimer);
    state.analysisTimer = 0;
  }
  if (wasAnalyzing) hintRapfi.cancel();
  renderAnalysis();
}

function verdictForBlack(black) {
  if (black >= 0.72) return "黑方胜势";
  if (black >= 0.58) return "黑方稍优";
  if (black >= 0.42) return "均势";
  if (black >= 0.28) return "白方稍优";
  return "白方胜势";
}

function renderAnalysis() {
  const analysis = state.analysis;
  if (!analysis) {
    els.evalBody.hidden = true;
    els.evalBar.setAttribute("aria-label", "黑白估算胜率");
    els.evalNote.textContent = state.analyzing
      ? "分析中…"
      : state.analysisError
        ? "本次分析失败，请再试一次。"
        : "基于 Rapfi 评分估算，不是精确统计胜率。";
    return;
  }

  const black = Math.round(analysis.black * 100);
  const white = 100 - black;
  els.evalBody.hidden = false;
  els.evalBlackBar.style.width = `${black}%`;
  els.evalWhiteBar.style.width = `${white}%`;
  els.evalBlackLabel.textContent = `黑 ${black}%`;
  els.evalWhiteLabel.textContent = `白 ${white}%`;
  els.evalBar.setAttribute("aria-label", `黑棋 ${black}%，白棋 ${white}%`);
  els.evalMeta.textContent = analysis.terminal
    ? "终局结果"
    : `深度 ${analysis.depth ?? "?"}${
        analysis.evalText != null ? ` · 评分 ${analysis.evalText}` : ""
      } · ${verdictForBlack(analysis.black)} · Rapfi 估算`;
  els.evalNote.textContent = "基于 Rapfi 评分估算，不是精确统计胜率。";
}

function syncAnalyzeUI() {
  els.analyze.disabled = !canAnalyze();
  els.analyze.textContent = state.analyzing ? "分析中…" : "分析";
  els.autoAnalyze.checked = state.autoAnalyze;
  els.analysisTime.value = String(state.analysisTime);
}

async function analyzePosition() {
  const game = state.game;
  if (state.analyzing || state.hinting || state.thinking || state.demo || game.isOver) return;

  const run = ++state.analysisRun;
  state.analyzing = true;
  state.analysisError = false;
  state.analysis = null;
  renderAnalysis();
  updateStatus();

  try {
    const result = await hintRapfi.analyze(game, state.analysisTime);
    if (state.analysisRun !== run || state.game !== game) return;
    state.analyzing = false;

    if (
      !result ||
      (!Number.isFinite(result.winRate) && !Number.isFinite(Number(result.eval)))
    ) {
      state.analysisError = true;
      renderAnalysis();
      updateStatus();
      return;
    }

    let rates;
    if (Number.isFinite(result.winRate)) {
      const sideToMove = Math.min(0.99, Math.max(0.01, result.winRate));
      rates =
        game.current === BLACK
          ? { black: sideToMove, white: 1 - sideToMove }
          : { black: 1 - sideToMove, white: sideToMove };
    } else {
      rates = estimateWinRates(Number(result.eval), game.current);
    }

    state.analysis = {
      ...rates,
      evalText: result.eval ?? null,
      depth: result.depth,
      terminal: false,
    };
    renderAnalysis();
    updateStatus();
  } catch (error) {
    if (state.analysisRun !== run || state.game !== game) return;
    state.analyzing = false;
    state.analysisError = true;
    console.warn("[gomoku] 形势分析失败", error);
    if (hintRapfi.failed) hintRapfi.cancel();
    renderAnalysis();
    updateStatus();
  }
}

function showTerminalEval() {
  const game = state.game;
  if (!game.isOver) return;
  state.analysisRun += 1;
  state.analyzing = false;
  state.analysisError = false;
  state.analysis = {
    ...terminalWinRates(game.winner),
    terminal: true,
    eval: null,
    depth: null,
  };
  renderAnalysis();
}

function scheduleAutoAnalysis(delay = 240) {
  if (!state.autoAnalyze || state.demo || state.local || state.game.isOver || isAITurn()) return;
  if (state.analysisTimer) clearTimeout(state.analysisTimer);
  state.analysisTimer = window.setTimeout(() => {
    state.analysisTimer = 0;
    analyzePosition();
  }, delay);
}

function setButtonReason(button, reason) {
  if (reason) {
    button.title = reason;
    button.setAttribute("aria-label", `${button.textContent.trim()}：${reason}`);
  } else {
    button.title = "";
    button.removeAttribute("aria-label");
  }
}

function updateStatus() {
  const game = state.game;
  let title = "";
  let sub = "";
  let mode = "your-turn";
  let color = aiColor();
  updateModeUI();

  if (state.review) {
    const view = state.review.view;
    mode = "review";
    color = view.winner || view.current;
    title = "复盘模式";
    sub = `第 ${state.review.index} / ${state.review.total} 手`;
  } else if (game.isOver) {
    if (state.local) {
      mode = game.winner ? "win" : "draw";
      color = game.winner || BLACK;
      title = game.winner ? `${colorName(game.winner)}棋获胜` : "和棋";
      sub = `${game.moveCount} 手 · 本地双人`;
    } else if (state.demo) {
      mode = "demo";
      color = game.winner || BLACK;
      title = game.winner ? `${colorName(game.winner)}棋获胜` : "和棋";
      sub = `${LEVEL_LABELS[state.demoLevels.black]} vs ${
        LEVEL_LABELS[state.demoLevels.white]
      } · ${game.moveCount} 手`;
    } else {
      color = game.winner || state.human;
      if (game.winner === state.human) {
        mode = "win";
        title = "你赢了";
        sub = `${game.moveCount} 手 · 五连成立`;
      } else if (game.winner) {
        mode = "lose";
        title = "这一局 AI 获胜";
        sub = `${game.moveCount} 手 · 再来一局？`;
      } else {
        mode = "draw";
        title = "和棋";
        sub = `${game.moveCount} 手 · 棋盘已满`;
      }
    }
  } else if (state.local) {
    color = game.current;
    if (state.hinting) {
      mode = "thinking";
      title = state.engineLoading ? "军师加载中" : "军师正在思考";
      sub = state.engineLoading
        ? "首次加载 Rapfi WASM · 约 1.3MB"
        : `为${colorName(game.current)}方分析当前局面…`;
    } else {
      mode = "your-turn";
      title = `${colorName(game.current)}方落子`;
      if (state.hintCell) {
        const reason = state.hintReason ? ` · ${state.hintReason}` : "";
        sub = `军师建议：${labelOf(state.hintCell)}${reason}`;
      } else {
        sub = `本地双人 · 第 ${game.moveCount + 1} 手`;
      }
    }
  } else if (state.demo) {
    mode = "demo";
    color = game.current;
    const sideLevel = LEVEL_LABELS[demoLevelFor(game.current)];
    if (state.demoPaused) {
      title = "演示已暂停";
      sub = `第 ${game.moveCount + 1} 手 · ${colorName(game.current)}方（${sideLevel}）· 点「继续」`;
    } else if (state.thinking) {
      title = "AI 对 AI 演示";
      sub = state.engineLoading
        ? `${colorName(game.current)}方（${sideLevel}）· 引擎加载中`
        : `第 ${game.moveCount + 1} 手 · ${colorName(game.current)}方（${sideLevel}）思考中`;
    } else {
      title = "AI 对 AI 演示";
      sub = `第 ${game.moveCount + 1} 手 · ${colorName(game.current)}方（${sideLevel}）准备落子`;
    }
  } else if (state.hinting) {
    mode = "thinking";
    color = state.human;
    if (state.engineLoading) {
      title = "军师加载中";
      sub = "首次加载 Rapfi WASM · 约 1.3MB";
    } else {
      title = "军师正在思考";
      sub = "正在分析当前局面…";
    }
  } else if (state.thinking) {
    mode = "thinking";
    color = aiColor();
    if (state.engineLoading) {
      title = "引擎加载中";
      sub = "首次加载 Rapfi WASM · 约 1.3MB";
    } else {
      title = "AI 正在思考";
      sub = `AI 执${colorName(aiColor())} · 第 ${game.moveCount + 1} 手`;
    }
  } else {
    mode = "your-turn";
    color = state.human;
    title = "轮到你落子";
    if (state.hintCell) {
      const reason = state.hintReason ? ` · ${state.hintReason}` : "";
      sub = `军师建议：${labelOf(state.hintCell)}${reason}`;
    } else {
      sub = `你执${colorName(state.human)} · 第 ${game.moveCount + 1} 手`;
    }
  }

  const busy = state.thinking || state.hinting;
  els.statusCard.dataset.state = mode;
  els.statusStone.dataset.color = stoneName(color);
  els.statusTitle.textContent = title;
  els.statusSub.textContent = sub;
  els.undo.disabled =
    state.review || state.demo || state.hinting || game.history.length === 0;
  els.hint.disabled = state.review || state.demo || !canHint();
  els.exportSgf.disabled = game.history.length === 0;
  if (els.saveSgf) els.saveSgf.disabled = game.history.length === 0;
  els.review.disabled = game.history.length === 0;
  els.share.disabled = game.history.length === 0;
  els.review.textContent = state.review ? "退出复盘" : "复盘";
  els.demo.disabled = Boolean(state.review || state.local);
  els.demo.textContent = state.demo
    ? game.isOver
      ? "演示"
      : state.demoPaused
        ? "继续"
        : "暂停"
    : "演示";
  els.demo.classList.toggle("is-active", state.demo);
  els.demo.setAttribute("aria-pressed", String(state.demo));

  for (const button of els.levelGroup.querySelectorAll("button")) {
    const active = button.dataset.level === state.difficulty;
    button.classList.toggle("is-busy", busy);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  els.boardMeta.textContent = `${game.size} × ${game.size} · 无禁手${
    state.local ? " · 本地双人" : ""
  }${state.demo ? " · 演示" : ""}${state.review ? " · 复盘" : ""}`;
  updateDemoControls();
  updateReviewBar();

  setButtonReason(
    els.undo,
    state.demo
      ? "AI 对 AI 演示中不可悔棋"
      : state.review
        ? "复盘模式中不可悔棋"
        : state.hinting
          ? "军师思考中，稍等"
          : state.thinking
            ? "点击会取消 AI 思考并悔棋"
            : game.history.length === 0
              ? "还没有可悔的棋"
              : state.local
                ? "退回上一手"
                : "退回双方各一手",
  );
  setButtonReason(
    els.hint,
    state.demo
      ? "AI 对 AI 演示中不可用"
      : state.review
        ? "复盘模式中不可用"
        : game.isOver
          ? "对局已结束"
          : state.thinking || state.hinting
            ? "AI 思考中，稍等"
            : state.local
              ? "为当前行棋方推荐一手"
              : game.current !== state.human
                ? "等待 AI 落子"
                : "让军师推荐一手",
  );
  setButtonReason(
    els.demo,
    state.local
      ? "本地双人模式不可演示"
      : state.demo
        ? game.isOver
          ? "再来一局 AI 对 AI"
          : state.demoPaused
            ? "继续演示"
            : "暂停演示"
        : "让双方 AI 自动对弈",
  );
  syncAnalyzeUI();
}

function afterMove() {
  renderer.setGame(state.game);
  updateStatus();

  if (state.game.isOver) {
    state.resultDismissed = false;
    try {
      recordResult();
    } catch (error) {
      console.warn("[gomoku] 战绩记录失败", error);
    }
    // recordResult 会更新系列赛比分，必须在它之后保存。
    saveGame();
    showResult();
    try {
      clearAnalysis();
      showTerminalEval();
    } catch (error) {
      console.warn("[gomoku] 终局胜率显示失败", error);
    }
    return;
  }

  clearAnalysis();
  updateStatus();
  saveGame();
  if (state.autoAnalyze && !state.demo) scheduleAutoAnalysis();
  if (isAITurn()) scheduleAI();
}

function placeHuman(x, y) {
  const game = state.game;
  if (!canHumanPlay() || !isPlayable({ x, y })) return;
  clearShareHash();
  clearHint();
  const player = game.current;
  const result = game.play(x, y);
  if (!result.ok) return;

  state.lastMoveAt = Date.now();
  playStoneSound();
  state.cursor = { x, y };
  renderer.setCursor(state.cursor);
  renderer.setHover(null);
  announce(
    state.local ? `${colorName(player)}方落 ${labelOf({ x, y })}` : `你落 ${labelOf({ x, y })}`,
  );
  afterMove();
}

async function requestHint() {
  const game = state.game;
  if (!canHint()) return;

  const run = ++state.aiRun;
  state.hinting = true;
  state.engineLoading = !hintRapfi.isReady && !hintRapfi.failed;
  clearHint();
  updateStatus();

  let move = null;
  try {
    move = await hintRapfi.requestHint(game);
  } catch (error) {
    if (state.aiRun !== run || state.game !== game) return;
    console.warn("[gomoku] 军师 WASM 不可用，回退到 JS AI", error);
    if (hintRapfi.failed) hintRapfi.cancel();
    try {
      move = await jsAI.chooseMove(game, "normal");
    } catch (fallbackError) {
      try {
        move = chooseMove(game, "normal");
      } catch (mainThreadError) {
        console.error("[gomoku] 军师 JS 回退失败", mainThreadError);
      }
    }
  }

  if (state.aiRun !== run || state.game !== game) return;
  state.hinting = false;
  state.engineLoading = false;

  if (game.isOver || !move || !isPlayable({ x: move.x, y: move.y })) {
    updateStatus();
    return;
  }

  state.hintCell = { x: move.x, y: move.y };
  state.hintReason = describeHint(
    game,
    state.hintCell,
    state.local ? game.current : state.human,
  );
  renderer.setHint(state.hintCell);
  updateStatus();
  announce(`军师建议 ${labelOf(state.hintCell)}，${state.hintReason}`);
}

function randomEmpty(game) {
  const empty = [];
  for (let i = 0; i < game.cells.length; i += 1) {
    if (game.cells[i] === EMPTY) empty.push(i);
  }
  if (!empty.length) return null;
  const index = empty[Math.floor(Math.random() * empty.length)];
  return { x: index % game.size, y: (index / game.size) | 0 };
}

function invalidateAI() {
  state.aiRun += 1;
  if (state.aiTimer) {
    clearTimeout(state.aiTimer);
    state.aiTimer = 0;
  }
  state.thinking = false;
  state.aiEngine = null;
  state.hinting = false;
  state.engineLoading = false;
  clearHint();
  clearAnalysis();
}

function cancelAI() {
  const wasThinking = state.thinking;
  const engine = state.aiEngine;
  const wasHinting = state.hinting;
  const wasAnalyzing = state.analyzing;
  invalidateAI();

  if (wasThinking) {
    if (engine === "rapfi") rapfi.cancel();
    else if (engine === "js") jsAI.cancel();
    else {
      rapfi.cancel();
      jsAI.cancel();
    }
  }
  if (rapfi.failed) rapfi.cancel();
  if (jsAI.failed) jsAI.cancel();
  if (wasHinting || wasAnalyzing || hintRapfi.failed) hintRapfi.cancel();
}

function scheduleAI() {
  if (state.local || !isAITurn()) return;

  const game = state.game;
  const level = state.demo ? demoLevelFor(game.current) : state.difficulty;
  const run = ++state.aiRun;
  const wantsRapfi = level === "hard" || level === "master" || level === "challenge";
  const usesRapfi = wantsRapfi && !rapfi.failed;

  state.thinking = true;
  state.aiEngine = usesRapfi ? "rapfi" : "js";
  state.engineLoading = usesRapfi && !rapfi.isReady && !rapfi.failed;
  updateStatus();

  state.aiTimer = window.setTimeout(async () => {
    state.aiTimer = 0;
    if (state.aiRun !== run || state.game !== game) return;

    let move = null;
    try {
      if (usesRapfi) {
        move = await rapfi.chooseMove(game, level);
      } else {
        move = await jsAI.chooseMove(game, level);
      }
    } catch (error) {
      if (state.aiRun !== run || state.game !== game) return;
      console.warn("[gomoku] Worker AI 不可用，回退到 JS AI Worker", error);
      state.aiEngine = "js";
      state.engineLoading = false;
      updateStatus();
      try {
        move = await jsAI.chooseMove(game, wantsRapfi ? "normal" : level);
      } catch (fallbackError) {
        console.warn("[gomoku] JS AI Worker 也不可用，回退到主线程", fallbackError);
        try {
          move = chooseMove(game, wantsRapfi ? "normal" : level);
        } catch (mainThreadError) {
          console.error("[gomoku] JS AI 也失败了", mainThreadError);
        }
      }
    }

    if (state.aiRun !== run || state.game !== game) return;
    state.thinking = false;
    state.aiEngine = null;
    state.engineLoading = false;

    if (!move || !isPlayable({ x: move.x, y: move.y })) {
      move = randomEmpty(game);
    }
    if (!move) {
      updateStatus();
      return;
    }

    const result = game.play(move.x, move.y);
    if (!result.ok) {
      const fallback = randomEmpty(game);
      if (fallback) game.play(fallback.x, fallback.y);
    }

    state.lastMoveAt = Date.now();
    playStoneSound();
    const last = game.lastMove;
    if (last) announce(`AI 落 ${labelOf(last)}`);
    afterMove();
  }, state.demo ? 260 : 80);
}

function undo() {
  if (state.demo || state.review || state.hinting) return;
  const game = state.game;
  if (!game.history.length) return;

  // AI 思考中也可以悔棋：先取消这一步计算，再退回上一手。
  if (state.thinking) cancelAI();

  game.undoLast();
  if (!state.local) {
    while (game.history.length && game.current !== state.human) {
      game.undoLast();
    }
  }

  state.resultDismissed = false;
  hideResult(false);
  clearHint();
  renderer.setHover(null);
  renderer.setGame(game);
  updateStatus();
  saveGame();

  // 悔棋后 Worker 内部历史已经失效；引擎正常就留着下次 BOARD 重建。
  if (rapfi.failed || jsAI.failed || hintRapfi.failed) cancelAI();
  else invalidateAI();
  updateStatus();
  if (!game.isOver && state.autoAnalyze && !state.demo) scheduleAutoAnalysis();
  if (!game.isOver && isAITurn()) scheduleAI();
}

function resetCursor(show = true) {
  const center = (state.game.size - 1) >> 1;
  state.cursor = { x: center, y: center };
  renderer.setCursor(show && document.activeElement === canvas ? state.cursor : null);
}

function reviewGameAt(index) {
  const game = new Game(state.game.size);
  for (let i = 0; i < index; i += 1) {
    const move = state.game.history[i];
    game.play(move.x, move.y);
  }
  return game;
}

function updateReviewBar() {
  if (!state.review) {
    els.reviewBar.hidden = true;
    return;
  }
  els.reviewBar.hidden = false;
  els.reviewLabel.textContent = `${state.review.index} / ${state.review.total}`;
  els.reviewPrev.disabled = state.review.index <= 0;
  els.reviewNext.disabled = state.review.index >= state.review.total;
}

function startReview() {
  const history = state.game.history;
  if (!history.length || state.review) return;

  if (state.thinking || state.hinting || state.analyzing) cancelAI();
  else invalidateAI();

  state.review = {
    index: history.length,
    total: history.length,
    view: reviewGameAt(history.length),
  };
  hideResult(false);
  renderer.setHover(null);
  renderer.setCursor(null);
  renderer.setGame(state.review.view);
  updateStatus();
}

function setReviewIndex(index) {
  if (!state.review) return;
  state.review.index = Math.max(0, Math.min(state.review.total, index));
  state.review.view = reviewGameAt(state.review.index);
  renderer.setGame(state.review.view);
  updateStatus();
}

function exitReview() {
  if (!state.review) return;
  const wasOver = state.game.isOver;
  state.review = null;
  els.reviewBar.hidden = true;
  renderer.setGame(state.game);
  renderer.setHover(null);
  updateStatus();
  if (wasOver) showResult();
  else if (state.autoAnalyze && !state.demo) scheduleAutoAnalysis();
  if (isAITurn()) scheduleAI();
}

function clearReview() {
  state.review = null;
  els.reviewBar.hidden = true;
}

function newGame() {
  clearShareHash();
  clearReview();
  const busy = state.thinking || state.hinting;
  if (busy || rapfi.failed || jsAI.failed || hintRapfi.failed) cancelAI();
  else invalidateAI();

  const size = Number(els.boardSize.value);
  state.human = els.side.value === "black" ? BLACK : WHITE;
  state.demo = false;
  state.demoPaused = false;
  state.demoSeries = null;
  state.game = new Game(SIZES.includes(size) ? size : 15);
  state.resultDismissed = false;
  state.resultRecorded = false;
  state.thinking = false;

  hideResult(false);
  resetCursor(false);
  renderer.setHover(null);
  renderer.setGame(state.game);
  updateModeUI();
  updateStatus();
  saveSettings();
  saveGame();
  announce(
    state.local ? "本地双人新对局开始，黑方先手" : `新对局开始，你执${colorName(state.human)}`,
  );

  if (state.human === WHITE && !state.local) scheduleAI();
}

function beginDemo(keepSeries = false) {
  clearShareHash();
  clearReview();
  state.local = false;
  const previousSeries = state.demoSeries;
  const keep =
    keepSeries &&
    previousSeries &&
    !previousSeries.finished &&
    previousSeries.games === 1;

  if (keep) {
    // 第一局结束后进入第二局：双方交换黑白，保证各执黑一次。
    state.demoLevels = { black: previousSeries.b, white: previousSeries.a };
  } else if (state.twoGameSeries) {
    state.demoSeries = createSeries(state.demoLevels.black, state.demoLevels.white);
  } else {
    state.demoSeries = null;
  }

  const busy = state.thinking || state.hinting;
  if (busy || rapfi.failed || jsAI.failed || hintRapfi.failed) cancelAI();
  else invalidateAI();

  const size = Number(els.boardSize.value);
  state.human = els.side.value === "black" ? BLACK : WHITE;
  state.demo = true;
  state.demoPaused = false;
  state.game = new Game(SIZES.includes(size) ? size : 15);
  state.resultDismissed = false;
  state.resultRecorded = false;
  state.thinking = false;
  if (els.demoConfig) els.demoConfig.open = true;
  updateModeUI();
  updateDemoControls();
  saveSettings();

  hideResult(false);
  resetCursor(false);
  renderer.setHover(null);
  renderer.setGame(state.game);
  updateStatus();
  saveGame();
  announce(keep ? "第二局开始，双方交换黑白" : "AI 对 AI 演示开始");

  scheduleAI();
}

function pauseDemo() {
  cancelAI();
  state.demoPaused = true;
  state.thinking = false;
  updateStatus();
  saveGame();
  announce("演示已暂停");
}

function resumeDemo() {
  state.demoPaused = false;
  updateStatus();
  saveGame();
  announce("继续演示");
  if (isAITurn()) scheduleAI();
}

function toggleDemo() {
  if (state.review || state.local) return;
  if (!state.demo) {
    const hasMoves = state.game.history.length > 0 && !state.game.isOver;
    if (hasMoves) {
      confirmThen("开始 AI 对 AI 演示会清空当前棋局，确定继续？", beginDemo);
    } else {
      beginDemo();
    }
    return;
  }

  if (state.game.isOver) {
    beginDemo(Boolean(state.demoSeries && !state.demoSeries.finished));
  } else if (state.demoPaused) {
    resumeDemo();
  } else {
    pauseDemo();
  }
}

function setDifficulty(level) {
  if (state.local || !isLevel(level)) return;
  if (state.difficulty === level) {
    els.levelNote.textContent = LEVEL_NOTES[level];
    return;
  }

  const previous = state.difficulty;
  if (state.thinking || state.hinting || rapfi.failed || jsAI.failed || hintRapfi.failed) {
    cancelAI();
  } else {
    invalidateAI();
  }

  applyDifficultyUI(level);
  // 演示双方都还停在默认难度时，跟着主难度一起走；系列赛开始后锁定双方。
  if (
    !state.demoSeries &&
    state.demoLevels.black === previous &&
    state.demoLevels.white === previous
  ) {
    state.demoLevels = { black: level, white: level };
    updateDemoControls();
  }
  saveSettings();
  saveGame();
  if (level === "hard" || level === "master" || level === "challenge") rapfi.prefetch();

  if (isAITurn()) scheduleAI();
  else updateStatus();
}

function setDemoLevel(side, level) {
  if (state.local) return;
  if ((side !== "black" && side !== "white") || !isLevel(level)) return;
  if (state.demoSeries && !state.demoSeries.finished) return;
  if (state.demoLevels[side] === level) return;

  state.demoLevels[side] = level;
  updateDemoControls();
  saveSettings();
  saveGame();

  if (!state.demo) return;

  const color = side === "black" ? BLACK : WHITE;
  if (!state.demoPaused && !state.game.isOver && state.game.current === color && state.thinking) {
    // 当前这一手正在用旧难度思考，直接按新难度重算。
    cancelAI();
    scheduleAI();
  } else {
    updateStatus();
  }
}

function setMode(local) {
  if (state.local === local) return;
  const apply = () => {
    state.local = local;
    updateModeUI();
    newGame();
  };

  if (state.game.history.length > 0 && !state.game.isOver) {
    confirmThen(
      local
        ? "切换到本地双人会开始新对局，当前棋局会被清空。"
        : "切换回人机模式会开始新对局，当前棋局会被清空。",
      apply,
    );
  } else {
    apply();
  }
}

function confirmThen(message, action) {
  if (!els.confirmDialog || typeof els.confirmDialog.showModal !== "function") {
    if (window.confirm(message)) action();
    return;
  }
  if (els.confirmDialog.open) return;

  state.confirmAction = action;
  els.confirmTitle.textContent = "确认操作";
  els.confirmText.textContent = message;
  els.confirmDialog.showModal();
}

function closeConfirm(run) {
  const action = state.confirmAction;
  state.confirmAction = null;
  if (els.confirmDialog.open) els.confirmDialog.close();
  if (run && action) action();
}

function requestRestart() {
  if (state.game.history.length > 0 && !state.game.isOver) {
    confirmThen(
      state.demo ? "结束演示并开始新对局？" : "当前棋局会被清空，确定开始新对局？",
      newGame,
    );
  } else {
    newGame();
  }
}

function onBoardSizeChange() {
  const next = els.boardSize.value;
  const prev = String(state.game.size);
  if (next === prev) return;

  if (state.game.history.length > 0) {
    els.boardSize.value = prev;
    confirmThen("切换棋盘尺寸会开始新对局，当前棋局会被清空。", () => {
      els.boardSize.value = next;
      newGame();
    });
  } else {
    newGame();
  }
}

function onSideChange() {
  const next = els.side.value;
  const prev = state.human === BLACK ? "black" : "white";
  if (next === prev && !state.demo) return;

  if (state.game.history.length > 0) {
    els.side.value = prev;
    confirmThen("切换执子会开始新对局，当前棋局会被清空。", () => {
      els.side.value = next;
      newGame();
    });
  } else {
    newGame();
  }
}

function showResult() {
  if (state.resultDismissed) return;
  const game = state.game;

  if (state.local) {
    els.resultTitle.textContent = game.winner ? `${colorName(game.winner)}棋获胜` : "和棋";
    els.resultSub.textContent = `${game.moveCount} 手 · 本地双人`;
    els.resultRestart.textContent = "再来一局";
  } else if (state.demo) {
    els.resultTitle.textContent = game.winner ? `${colorName(game.winner)}棋获胜` : "和棋";
    const series = state.demoSeries;
    let seriesText = "";
    if (series) {
      const a = LEVEL_LABELS[series.a] || "A";
      const b = LEVEL_LABELS[series.b] || "B";
      const outcome = seriesOutcome(series);
      seriesText = ` · 两局赛 A ${series.wins.a}:${series.wins.b} B`;
      if (series.finished) {
        seriesText +=
          outcome === "draw" ? " · 平局" : ` · ${outcome === "a" ? a : b} 获胜`;
      }
    }
    els.resultSub.textContent = `${LEVEL_LABELS[state.demoLevels.black]} vs ${
      LEVEL_LABELS[state.demoLevels.white]
    } · 共 ${game.moveCount} 手${seriesText}`;
    els.resultRestart.textContent =
      series && !series.finished
        ? "第二局（交换黑白）"
        : series
          ? "再来一届演示"
          : "下一局演示";
  } else if (game.winner === state.human) {
    els.resultTitle.textContent = "你赢了";
    els.resultSub.textContent = `${game.moveCount} 手 · 五连成立`;
    els.resultRestart.textContent = "再来一局";
  } else if (game.winner) {
    els.resultTitle.textContent = "AI 获胜";
    els.resultSub.textContent = `${game.moveCount} 手 · 再来一局？`;
    els.resultRestart.textContent = "再来一局";
  } else {
    els.resultTitle.textContent = "和棋";
    els.resultSub.textContent = `${game.moveCount} 手 · 棋盘已满`;
    els.resultRestart.textContent = "再来一局";
  }

  els.resultUndo.hidden = state.demo;
  els.resultOverlay.hidden = false;
  state.resultOpen = true;
  announce(els.resultTitle.textContent);

  window.setTimeout(() => {
    if (!els.resultOverlay.hidden) {
      els.resultRestart.focus({ preventScroll: true });
    }
  }, 30);
}

function hideResult(focus = true) {
  els.resultOverlay.hidden = true;
  state.resultOpen = false;
  if (focus) canvas.focus({ preventScroll: true });
}

function closeResult() {
  state.resultDismissed = true;
  hideResult(true);
}

let announceTimer = 0;
function announce(text) {
  if (!els.srStatus) return;
  // 演示每 260ms 一步，逐手播报会淹没读屏；演示只看结算结果。
  if (state.demo && !state.game.isOver) return;
  clearTimeout(announceTimer);
  els.srStatus.textContent = "";
  announceTimer = window.setTimeout(() => {
    els.srStatus.textContent = text;
  }, 30);
}

function moveCursor(dx, dy) {
  const game = state.game;
  const cursor = state.cursor || { x: (game.size - 1) >> 1, y: (game.size - 1) >> 1 };
  state.cursor = {
    x: Math.max(0, Math.min(game.size - 1, cursor.x + dx)),
    y: Math.max(0, Math.min(game.size - 1, cursor.y + dy)),
  };
  renderer.setCursor(state.cursor);
}

function handleCanvasKey(event) {
  const key = event.key;

  if (key === "Escape") {
    if (state.resultOpen) {
      closeResult();
      return;
    }
    renderer.setCursor(null);
    return;
  }

  if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
    event.preventDefault();
    const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    moveCursor(dx, dy);
    return;
  }

  if (key === "Enter" || key === " ") {
    event.preventDefault();
    if (canHumanPlay() && state.cursor) {
      placeHuman(state.cursor.x, state.cursor.y);
    }
  }
}

els.levelGroup.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-level]");
  if (!button) return;
  setDifficulty(button.dataset.level);
});

els.modeGroup.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  setMode(button.dataset.mode === "local");
});

els.boardSize.addEventListener("change", onBoardSizeChange);
els.side.addEventListener("change", onSideChange);
els.restart.addEventListener("click", requestRestart);
els.undo.addEventListener("click", undo);
els.exportSgf.addEventListener("click", exportSgf);
els.share.addEventListener("click", sharePosition);
els.importSgfButton.addEventListener("click", () => els.importSgf.click());
els.importSgf.addEventListener("change", () => {
  const file = els.importSgf.files && els.importSgf.files[0];
  els.importSgf.value = "";
  importSgfFile(file);
});
els.saveSgf.addEventListener("click", saveCurrentToLibrary);
els.deleteSgf.addEventListener("click", deleteLibraryItem);
els.sgfLibrary.addEventListener("change", () => {
  els.deleteSgf.disabled = els.sgfLibrary.value === "";
  if (els.sgfLibrary.value !== "") loadLibraryItem(Number(els.sgfLibrary.value));
});
els.review.addEventListener("click", () => {
  if (state.review) exitReview();
  else startReview();
});
els.reviewPrev.addEventListener("click", () => {
  if (state.review) setReviewIndex(state.review.index - 1);
});
els.reviewNext.addEventListener("click", () => {
  if (state.review) setReviewIndex(state.review.index + 1);
});
els.reviewExit.addEventListener("click", exitReview);
els.hint.addEventListener("click", requestHint);
els.demo.addEventListener("click", toggleDemo);
els.demoBlack.addEventListener("change", () => setDemoLevel("black", els.demoBlack.value));
els.demoWhite.addEventListener("change", () => setDemoLevel("white", els.demoWhite.value));
els.twoGameSeries.addEventListener("change", () => {
  state.twoGameSeries = els.twoGameSeries.checked;
  state.demoSeries = null;
  saveSettings();
  updateDemoControls();
  updateStatus();
});
els.swapDemo.addEventListener("click", () => {
  if (state.demoSeries && !state.demoSeries.finished) return;
  const { black, white } = state.demoLevels;
  state.demoLevels = { black: white, white: black };
  updateDemoControls();
  saveSettings();
  saveGame();
  if (state.demo && !state.demoPaused && !state.game.isOver) {
    if (state.thinking) {
      cancelAI();
      scheduleAI();
    } else {
      updateStatus();
    }
  }
});
els.analyze.addEventListener("click", analyzePosition);
els.autoAnalyze.addEventListener("change", () => {
  state.autoAnalyze = els.autoAnalyze.checked;
  saveSettings();
  if (state.analysisTimer) {
    clearTimeout(state.analysisTimer);
    state.analysisTimer = 0;
  }
  if (state.autoAnalyze && !isAITurn()) analyzePosition();
  else updateStatus();
});
els.analysisTime.addEventListener("change", () => {
  const time = Number(els.analysisTime.value);
  if ([500, 800, 2000].includes(time)) state.analysisTime = time;
  saveSettings();
  updateStatus();
  if (state.autoAnalyze && !isAITurn() && !state.analyzing) analyzePosition();
});
els.hint.addEventListener("pointerenter", () => hintRapfi.prefetch());
els.hint.addEventListener("focus", () => hintRapfi.prefetch());

els.resultRestart.addEventListener("click", () => {
  if (state.demo) beginDemo(Boolean(state.demoSeries && !state.demoSeries.finished));
  else newGame();
});
els.resultUndo.addEventListener("click", () => {
  state.resultDismissed = false;
  hideResult(false);
  undo();
});
els.resultClose.addEventListener("click", closeResult);

function trapResultFocus(event) {
  if (event.key !== "Tab" || els.resultOverlay.hidden) return;
  const focusable = [...els.resultOverlay.querySelectorAll("button:not([disabled]):not([hidden])")];
  if (!focusable.length) {
    event.preventDefault();
    els.resultOverlay.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (active === els.resultOverlay) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

els.resultOverlay.addEventListener("keydown", trapResultFocus);

els.confirmOk.addEventListener("click", () => closeConfirm(true));
els.confirmCancel.addEventListener("click", () => closeConfirm(false));
els.confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConfirm(false);
});
els.confirmDialog.addEventListener("close", () => {
  state.confirmAction = null;
});
els.confirmDialog.addEventListener("click", (event) => {
  if (event.target === els.confirmDialog) closeConfirm(false);
});

canvas.addEventListener("focus", () => {
  renderer.setCursor(state.cursor);
});
canvas.addEventListener("blur", () => {
  renderer.setCursor(null);
});
canvas.addEventListener("keydown", handleCanvasKey);

function finishTouch(clientX, clientY) {
  if (state.touchPointerId === null) return;
  const cell = renderer.hitTest(clientX, clientY);
  const target = cell ? (isPlayable(cell) ? cell : null) : state.touchCell;
  hideMagnifier();
  if (target && isPlayable(target)) placeHuman(target.x, target.y);
}

function placeFromClick(event) {
  if (event.detail === 0) return;
  if (Date.now() - state.lastMoveAt < 700) return;
  if (!canHumanPlay()) return;
  const cell = renderer.hitTest(event.clientX, event.clientY);
  if (!cell || !isPlayable(cell)) return;
  hideMagnifier();
  placeHuman(cell.x, cell.y);
}

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    if (state.touchPointerId !== event.pointerId || !state.touchCell) return;
    const cell = renderer.hitTest(event.clientX, event.clientY);
    if (cell && isPlayable(cell)) {
      state.touchCell = cell;
      showMagnifier(cell, event.clientX, event.clientY);
    }
    return;
  }
  if (!canHumanPlay()) {
    renderer.setHover(null);
    return;
  }
  const cell = renderer.hitTest(event.clientX, event.clientY);
  renderer.setHover(cell && isPlayable(cell) ? cell : null);
});

canvas.addEventListener("pointerleave", () => renderer.setHover(null));

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  if (!canHumanPlay()) return;
  const cell = renderer.hitTest(event.clientX, event.clientY);
  if (!cell) return;
  state.cursor = cell;
  renderer.setCursor(cell);

  if (event.pointerType === "touch" && state.game.size === 19) {
    state.touchCell = cell;
    state.touchPointerId = event.pointerId;
    showMagnifier(cell, event.clientX, event.clientY);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    return;
  }

  placeHuman(cell.x, cell.y);
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "touch" || state.touchPointerId !== event.pointerId) return;
  finishTouch(event.clientX, event.clientY);
});

canvas.addEventListener(
  "touchend",
  (event) => {
    if (state.touchPointerId === null) return;
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    finishTouch(touch.clientX, touch.clientY);
  },
  { passive: false },
);

canvas.addEventListener("click", placeFromClick);

canvas.addEventListener("pointercancel", () => hideMagnifier());

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.resultOpen) return;
  const installHelp = document.querySelector("#installHelp");
  if ((els.confirmDialog && els.confirmDialog.open) || (installHelp && installHelp.open)) return;
  closeResult();
});

window.addEventListener("beforeunload", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});

const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
if (mediaQuery.matches) {
  canvas.style.transition = "none";
}

function init() {
  const saved = loadSettings();
  if (saved) {
    const size = Number(saved.size);
    if (SIZES.includes(size)) els.boardSize.value = String(size);
    if (saved.side === "black" || saved.side === "white") els.side.value = saved.side;
  }

  const level = saved && isLevel(saved.level) ? saved.level : "normal";
  state.local = Boolean(saved && saved.local);
  state.stats = loadStats();
  state.library = loadLibrary();
  updateLibraryUI();
  updateModeUI();
  applyDifficultyUI(level);
  state.demoLevels = {
    black: saved && isLevel(saved.demoBlack) ? saved.demoBlack : level,
    white: saved && isLevel(saved.demoWhite) ? saved.demoWhite : level,
  };
  state.autoAnalyze = Boolean(saved && saved.autoAnalyze);
  state.twoGameSeries = Boolean(saved && saved.twoGameSeries);
  const savedAnalysisTime = Number(saved && saved.analysisTime);
  if ([500, 800, 2000].includes(savedAnalysisTime)) state.analysisTime = savedAnalysisTime;
  els.autoAnalyze.checked = state.autoAnalyze;
  els.analysisTime.value = String(state.analysisTime);
  updateDemoControls();
  renderAnalysis();
  if (level === "hard" || level === "master" || level === "challenge") rapfi.prefetch();

  if (!loadSharedPosition()) {
    if (!restoreGame()) newGame();
  }
  initTheme();
  initSound();
  initPWA();
}

init();
