const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { adjustWallet } = require("../services/wallet");
const slotopol = require("../services/slotopol");

const router = express.Router();

/** @type {Map<string, { gid: number, alias: string, sel: number, bet: number, fs: number }>} */
const sessions = new Map();

function sessionKey(userId, alias) {
  return `${userId}:${alias}`;
}

function findGame(alias) {
  return slotopol.CATALOG.find((g) => g.alias === alias);
}

function extractGain(result) {
  if (typeof result?.game?.gain === "number") return result.game.gain;
  if (Array.isArray(result?.wins)) {
    return result.wins.reduce((s, w) => s + Number(w.pay || 0) * Number(w.mp || 1), 0);
  }
  return 0;
}

function extractFs(result) {
  return Number(result?.game?.fs || result?.fs || result?.fsr || 0);
}

router.get("/health", async (_req, res) => {
  res.json(await slotopol.health());
});

router.get("/catalog", (_req, res) => {
  res.json({
    games: slotopol.CATALOG.map((g) => ({
      ...g,
      launchUrl: `/games/slotopol-player/index.html?alias=${encodeURIComponent(g.alias)}`,
    })),
  });
});

router.post("/session", requireAuth, async (req, res) => {
  try {
    if (req.user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Hesap askıda" });
    }
    const alias = String(req.body?.alias || "").toLowerCase().trim();
    const meta = findGame(alias);
    if (!meta) return res.status(400).json({ error: "Oyun desteklenmiyor" });

    const created = await slotopol.newGame(alias);
    const sel = Number(created.game?.sel || meta.defaultSel);
    const bet = Number(req.body?.bet || created.game?.bet || 1);
    const key = sessionKey(req.user.id, alias);
    sessions.set(key, { gid: created.gid, alias, sel, bet, fs: extractFs(created) });

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    res.json({
      alias,
      name: meta.name,
      provider: meta.provider,
      gid: created.gid,
      sel,
      bet,
      grid: created.game?.grid || [],
      freeSpins: extractFs(created),
      balance: wallet?.balance || 0,
      cost: bet * sel,
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({
      error: err.message?.includes("fetch") || err.message?.includes("ECONNREFUSED")
        ? "Slot motoru kapalı — Slotopol’ü başlatın"
        : err.message || "Oturum açılamadı",
    });
  }
});

router.post("/spin", requireAuth, async (req, res) => {
  try {
    if (req.user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Hesap askıda" });
    }
    const alias = String(req.body?.alias || "").toLowerCase().trim();
    const meta = findGame(alias);
    if (!meta) return res.status(400).json({ error: "Oyun desteklenmiyor" });

    const key = sessionKey(req.user.id, alias);
    let session = sessions.get(key);
    if (!session) {
      const created = await slotopol.newGame(alias);
      session = {
        gid: created.gid,
        alias,
        sel: Number(created.game?.sel || meta.defaultSel),
        bet: Number(created.game?.bet || 1),
        fs: extractFs(created),
      };
      sessions.set(key, session);
    }

    const bet = Number(req.body?.bet || session.bet || 1);
    const sel = Number(req.body?.sel || session.sel || meta.defaultSel);
    if (!(bet > 0) || !(sel > 0)) {
      return res.status(400).json({ error: "Geçersiz bahis" });
    }

    const usingFree = session.fs > 0;
    const cost = usingFree ? 0 : bet * sel;

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(400).json({ error: "Cüzdan bulunamadı" });
    if (!usingFree && wallet.balance < cost) {
      return res.status(400).json({ error: "Yetersiz bakiye" });
    }

    if (!usingFree) {
      await adjustWallet(req.user.id, -cost, "BET", `Slotopol ${meta.name} bahis ${cost}`);
    }

    let result;
    try {
      result = await slotopol.spin(session.gid, bet, sel);
    } catch (spinErr) {
      if (!usingFree) {
        await adjustWallet(req.user.id, cost, "ADJUST", `Slotopol iade ${meta.name}`);
      }
      throw spinErr;
    }

    const gain = extractGain(result);
    const fs = extractFs(result);
    session.bet = bet;
    session.sel = Number(result.game?.sel || sel);
    session.fs = fs;
    sessions.set(key, session);

    let walletAfter = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (gain > 0) {
      const credited = await adjustWallet(
        req.user.id,
        gain,
        "WIN",
        `Slotopol ${meta.name} kazanç ${gain}`
      );
      walletAfter = credited.wallet;
    }

    res.json({
      alias,
      name: meta.name,
      gid: session.gid,
      bet,
      sel: session.sel,
      cost,
      usingFree,
      win: gain,
      wins: result.wins || [],
      grid: result.game?.grid || [],
      freeSpins: fs,
      balance: walletAfter.balance,
      sid: result.sid || result.slid || null,
    });
  } catch (err) {
    console.error(err);
    const msg = err.message || "Spin başarısız";
    const code = msg.includes("Yetersiz") ? 400 : msg.includes("kapalı") || msg.includes("ECONNREFUSED") ? 503 : 500;
    res.status(code).json({ error: msg });
  }
});

module.exports = router;
