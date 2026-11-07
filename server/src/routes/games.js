const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const { category, provider, q, tag, featured, popular } = req.query;
  const where = {
    active: true,
    provider: { active: true },
  };
  if (category) where.category = String(category);
  if (provider) where.provider = { ...where.provider, name: String(provider) };
  if (featured === "1") where.featured = true;
  if (popular === "1") where.popular = true;
  if (q) where.name = { contains: String(q) };

  let games = await prisma.game.findMany({
    where,
    include: { provider: { select: { id: true, name: true } } },
    orderBy: [{ popular: "desc" }, { featured: "desc" }, { name: "asc" }],
  });

  if (tag) {
    games = games.filter((g) => {
      try {
        return JSON.parse(g.tags || "[]").includes(String(tag));
      } catch {
        return false;
      }
    });
  }

  const providers = await prisma.gameProvider.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const categories = [...new Set((await prisma.game.findMany({
    where: { active: true },
    select: { category: true },
  })).map((g) => g.category))];

  res.json({ games, providers, categories });
});

router.get("/:id", async (req, res) => {
  const game = await prisma.game.findFirst({
    where: { id: req.params.id, active: true },
    include: { provider: { select: { id: true, name: true } } },
  });
  if (!game) return res.status(404).json({ error: "Oyun bulunamadı" });
  res.json({ game });
});

router.post("/:id/launch", requireAuth, async (req, res) => {
  try {
    if (req.user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Hesap askıda" });
    }
    const game = await prisma.game.findFirst({
      where: { id: req.params.id, active: true, provider: { active: true } },
      include: { provider: true },
    });
    if (!game) return res.status(404).json({ error: "Oyun bulunamadı" });

    const session = await prisma.gameSession.create({
      data: { userId: req.user.id, gameId: game.id },
    });

    res.json({
      sessionId: session.id,
      launchUrl: game.launchUrl,
      game: {
        id: game.id,
        name: game.name,
        category: game.category,
        provider: game.provider.name,
        rtp: game.rtp,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Oyun başlatılamadı" });
  }
});

module.exports = router;
