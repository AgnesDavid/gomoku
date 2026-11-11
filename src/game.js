export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export const opponent = (player) => (player === BLACK ? WHITE : BLACK);

/**
 * 一次成型：落子后只有经过最新一子的四条线可能成五。
 * 返回连线上的所有交叉点（含首尾），未成五返回 null。
 */
export function findWinLine(cells, size, x, y, player) {
  for (let d = 0; d < DIRECTIONS.length; d += 1) {
    const [dx, dy] = DIRECTIONS[d];
    const line = [{ x, y }];

    for (let sign = 1; sign >= -1; sign -= 2) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (
        nx >= 0 &&
        ny >= 0 &&
        nx < size &&
        ny < size &&
        cells[ny * size + nx] === player
      ) {
        if (sign === 1) line.push({ x: nx, y: ny });
        else line.unshift({ x: nx, y: ny });
        nx += dx * sign;
        ny += dy * sign;
      }
    }

    if (line.length >= 5) return line;
  }
  return null;
}

/** 快速判定：不分配数组，供搜索内层使用。 */
export function hasFive(cells, size, x, y, player) {
  for (let d = 0; d < DIRECTIONS.length; d += 1) {
    const [dx, dy] = DIRECTIONS[d];
    let count = 1;

    for (let sign = 1; sign >= -1; sign -= 2) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === player) {
        count += 1;
        nx += dx * sign;
        ny += dy * sign;
      }
    }

    if (count >= 5) return true;
  }
  return false;
}

export class Game {
  constructor(size = 15) {
    this.size = size;
    this.reset(size);
  }

  reset(size = this.size) {
    this.size = size;
    this.cells = new Int8Array(size * size);
    this.history = [];
    this.current = BLACK;
    this.winner = EMPTY;
    this.winLine = null;
    this.draw = false;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.cells[y * this.size + x];
  }

  get isOver() {
    return this.winner !== EMPTY || this.draw;
  }

  get lastMove() {
    return this.history.length ? this.history[this.history.length - 1] : null;
  }

  get moveCount() {
    return this.history.length;
  }

  play(x, y) {
    if (this.isOver) return { ok: false, reason: "over" };
    if (!this.inBounds(x, y)) return { ok: false, reason: "out-of-bounds" };

    const index = y * this.size + x;
    if (this.cells[index] !== EMPTY) return { ok: false, reason: "occupied" };

    const player = this.current;
    this.cells[index] = player;
    this.history.push({ x, y, player });

    const winLine = findWinLine(this.cells, this.size, x, y, player);
    if (winLine) {
      this.winner = player;
      this.winLine = winLine;
    } else if (this.history.length === this.size * this.size) {
      this.draw = true;
    } else {
      this.current = opponent(player);
    }

    return { ok: true, winner: this.winner, winLine: this.winLine, draw: this.draw };
  }

  undoLast() {
    if (this.history.length === 0) return null;

    const move = this.history.pop();
    this.cells[move.y * this.size + move.x] = EMPTY;
    this.winner = EMPTY;
    this.winLine = null;
    this.draw = false;
    this.current = move.player;
    return move;
  }
}
