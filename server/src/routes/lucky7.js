const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { adjustWallet } = require("../services/wallet");
const {
  ALLOWED_BETS,
  generateBoard,
  evaluate,
  boardPayload,
} = require("../games/lucky7");

const router = express.Router();
const GAME_KEY = "lucky7";

async function getJackpot() {
  const setting = await prisma.platformSetting.findUnique({ where: { id: "main" } });
  let data = {};
  try {
    data = JSON.parse(setting?.data || "{}");
  } catch (_) {}
  if (typeof data.lucky7Jackpot !== "number") data.lucky7Jackpot = 2500;
  return { setting, data, jackpot: data.lucky7Jackpot };
}

async function saveJackpot(setting, data, jackpot) {
  data.lucky7Jackpot = Number(jackpot.toFixed(2));
  await prisma.platformSetting.upsert({
    where: { id: "main" },
    update: { data: JSON.stringify(data) },
    create: { id: "main", data: JSON.stringify(data) },
  });
}

async function getGameState(userId) {
  return prisma.playerGameState.upsert({
    where: { userId_gameKey: { userId, gameKey: GAME_KEY } },
    update: {},
    create: { userId, gameKey: GAME_KEY, freeSpins: 0 },
  });
}

router.get("/state", requireAuth, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    const gameState = await getGameState(req.user.id);
    const { jackpot } = await getJackpot();
    res.json({
      balance: wallet?.balance || 0,
      freeSpins: gameState.freeSpins,
      jackpot,
      bets: ALLOWED_BETS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Durum alınamadı" });
  }
});

router.post("/spin", requireAuth, async (req, res) => {
  try {
    const bet = Number(req.body?.bet);
    if (!ALLOWED_BETS.includes(bet)) {
      return res.status(400).json({ error: "Geçersiz bahis" });
    }
    if (req.user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Hesap askıda" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user.id } });
      if (!wallet) throw new Error("Cüzdan bulunamadı");

      let gameState = await tx.playerGameState.upsert({
        where: { userId_gameKey: { userId: req.user.id, gameKey: GAME_KEY } },
        update: {},
        create: { userId: req.user.id, gameKey: GAME_KEY, freeSpins: 0 },
      });

      const usingFree = gameState.freeSpins > 0;
      if (!usingFree && wallet.balance < bet) {
        throw new Error("Yetersiz bakiye");
      }

      if (usingFree) {
        gameState = await tx.playerGameState.update({
          where: { id: gameState.id },
          data: { freeSpins: { decrement: 1 } },
        });
      } else {
        await adjustWallet(req.user.id, -bet, "BET", `Lucky7 bahis ${bet}`, tx);
      }

      const setting = await tx.platformSetting.findUnique({ where: { id: "main" } });
      let data = {};
      try {
        data = JSON.parse(setting?.data || "{}");
      } catch (_) {}
      let jackpot = typeof data.lucky7Jackpot === "number" ? data.lucky7Jackpot : 2500;
      if (!usingFree) jackpot += bet * 0.04;

      const board = generateBoard();
      const ev = evaluate(board, bet, jackpot);

      if (ev.jackpotHit) {
        jackpot = Math.max(500, jackpot - ev.jackpotWin);
      }

      data.lucky7Jackpot = Number(jackpot.toFixed(2));
      await tx.platformSetting.upsert({
        where: { id: "main" },
        update: { data: JSON.stringify(data) },
        create: { id: "main", data: JSON.stringify(data) },
      });

      if (ev.freeAward > 0) {
        gameState = await tx.playerGameState.update({
          where: { id: gameState.id },
          data: { freeSpins: { increment: ev.freeAward } },
        });
      }

      let walletAfter = await tx.wallet.findUnique({ where: { userId: req.user.id } });
      if (ev.win > 0) {
        const credited = await adjustWallet(
          req.user.id,
          ev.win,
          "WIN",
          `Lucky7 kazanç ${ev.win}`,
          tx
        );
        walletAfter = credited.wallet;
      }

      return {
        board: boardPayload(board),
        bet,
        usingFree,
        win: ev.win,
        winCells: ev.winCells,
        freeAward: ev.freeAward,
        freeSpins: gameState.freeSpins,
        jackpot: data.lucky7Jackpot,
        jackpotHit: ev.jackpotHit,
        balance: walletAfter.balance,
      };
    });

    res.json(result);
  } catch (err) {
    const msg = err.message || "Spin başarısız";
    const code = msg.includes("Yetersiz") ? 400 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

module.exports = router;
