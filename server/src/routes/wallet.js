const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  res.json({ wallet });
});

router.get("/transactions", requireAuth, async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ transactions });
});

module.exports = router;
