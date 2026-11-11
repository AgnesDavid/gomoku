import { DIRECTIONS, hasFive, opponent } from "./game.js?v=20261106-3";

/**
 * 给军师建议配一句人话。
 * 只做轻量棋型判断，不参与搜索；目的是让“H8”这种坐标更容易理解。
 */

function lineStats(cells, size, x, y, player, dx, dy) {
  let count = 1;
  let open = 0;

  for (let sign = 1; sign >= -1; sign -= 2) {
    let nx = x + dx * sign;
    let ny = y + dy * sign;
    while (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === player) {
      count += 1;
      nx += dx * sign;
      ny += dy * sign;
    }
    if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === 0) {
      open += 1;
    }
  }

  return { count, open };
}

function wouldWin(game, x, y, player) {
  const index = y * game.size + x;
  if (game.cells[index] !== 0) return false;
  game.cells[index] = player;
  const win = hasFive(game.cells, game.size, x, y, player);
  game.cells[index] = 0;
  return win;
}

function maxLine(game, x, y, player) {
  let four = false;
  let openFour = false;
  let openThrees = 0;

  for (const [dx, dy] of DIRECTIONS) {
    const { count, open } = lineStats(game.cells, game.size, x, y, player, dx, dy);
    if (count >= 5) return { five: true, four: true, openFour: true, openThrees: 2 };
    if (count === 4 && open >= 1) {
      four = true;
      if (open === 2) openFour = true;
    }
    if (count === 3 && open === 2) openThrees += 1;
  }

  return { five: false, four, openFour, openThrees };
}

export function describeHint(game, move, human) {
  if (!move || !game || game.cells[move.y * game.size + move.x] !== 0) return "抢占要点";

  const foe = opponent(human);
  if (wouldWin(game, move.x, move.y, human)) return "直接成五";
  if (wouldWin(game, move.x, move.y, foe)) return "堵对方成五";

  const mine = maxLine(game, move.x, move.y, human);
  const theirs = maxLine(game, move.x, move.y, foe);

  if (mine.openFour) return "做成活四";
  if (mine.four) return "冲四";
  if (theirs.four) return "堵四";
  if (mine.openThrees >= 2) return "做成双活三";
  if (theirs.openThrees >= 2) return "堵双活三";
  if (mine.openThrees >= 1) return "做成活三";
  if (theirs.openThrees >= 1) return "堵活三";
  return "抢占要点";
}
