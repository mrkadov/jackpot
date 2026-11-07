const SYMBOLS = [
  { id: "seven", icon: "7️⃣", weight: 3, pay: { 3: 15, 4: 40, 5: 120 } },
  { id: "bell", icon: "🔔", weight: 6, pay: { 3: 8, 4: 20, 5: 60 } },
  { id: "cherry", icon: "🍒", weight: 10, pay: { 3: 4, 4: 10, 5: 25 } },
  { id: "lemon", icon: "🍋", weight: 12, pay: { 3: 3, 4: 8, 5: 18 } },
  { id: "grape", icon: "🍇", weight: 12, pay: { 3: 3, 4: 8, 5: 18 } },
  { id: "wild", icon: "⭐", weight: 4, pay: { 3: 20, 4: 50, 5: 150 }, wild: true },
  { id: "scatter", icon: "💎", weight: 3, pay: {}, scatter: true },
];

const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

const ALLOWED_BETS = [1, 2, 5, 10, 25, 50];

function weightedPick() {
  const total = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const sym of SYMBOLS) {
    r -= sym.weight;
    if (r <= 0) return sym;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

function generateBoard() {
  return [0, 1, 2, 3, 4].map(() => [weightedPick(), weightedPick(), weightedPick()]);
}

function evaluate(board, bet, jackpot) {
  let win = 0;
  const winCells = [];
  let scatters = 0;
  let jackpotHit = false;
  let jackpotWin = 0;

  for (let r = 0; r < 5; r++) {
    for (let row = 0; row < 3; row++) {
      if (board[r][row].scatter) scatters += 1;
    }
  }

  for (const line of PAYLINES) {
    const seq = line.map((row, reel) => board[reel][row]);
    const base = seq.find((s) => !s.wild && !s.scatter) || seq.find((s) => s.wild);
    if (!base || base.scatter) continue;

    let count = 0;
    for (const s of seq) {
      if (s.scatter) break;
      if (s.wild || s.id === base.id) count += 1;
      else break;
    }
    if (count >= 3 && base.pay[count]) {
      win += base.pay[count] * bet;
      for (let i = 0; i < count; i++) winCells.push(`${i}:${line[i]}`);
    }
  }

  const mid = board.map((col) => col[1]);
  if (mid.every((s) => s.id === "seven" || s.wild)) {
    jackpotWin = Math.floor(jackpot * 0.15);
    win += jackpotWin;
    jackpotHit = true;
  }

  let freeAward = 0;
  if (scatters >= 3) freeAward = scatters >= 5 ? 15 : scatters === 4 ? 12 : 8;

  return {
    win: Number(win.toFixed(2)),
    winCells: [...new Set(winCells)],
    scatters,
    freeAward,
    jackpotHit,
    jackpotWin,
  };
}

function boardPayload(board) {
  return board.map((col) => col.map((s) => ({ id: s.id, icon: s.icon })));
}

module.exports = {
  ALLOWED_BETS,
  generateBoard,
  evaluate,
  boardPayload,
};
