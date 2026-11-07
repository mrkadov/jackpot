const express = require("express");
const prisma = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { scorePaymentRisk } = require("../services/risk");
const { adjustWallet } = require("../services/wallet");

const router = express.Router();

const AUTO_WITHDRAW_MAX = 1000;
const AUTO_RISK_MAX = 20;

router.get("/methods", async (_req, res) => {
  const methods = await prisma.paymentMethod.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  res.json({ methods });
});

router.get("/mine", requireAuth, async (req, res) => {
  const payments = await prisma.paymentRequest.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ payments });
});

router.post("/deposit", requireAuth, async (req, res) => {
  try {
    const { amount, method, note } = req.body || {};
    const value = Number(amount);
    if (!value || value <= 0) return res.status(400).json({ error: "Geçerli tutar girin" });
    if (!method) return res.status(400).json({ error: "Ödeme yöntemi zorunlu" });

    const cfg = await prisma.paymentMethod.findFirst({
      where: { OR: [{ code: method }, { name: method }], active: true },
    });
    if (cfg) {
      if (value < cfg.minAmount || value > cfg.maxAmount) {
        return res.status(400).json({
          error: `Tutar ${cfg.minAmount} - ${cfg.maxAmount} arasında olmalı`,
        });
      }
    }

    if (req.user.depositLimitDaily) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const today = await prisma.paymentRequest.aggregate({
        where: {
          userId: req.user.id,
          type: "DEPOSIT",
          status: { in: ["PENDING", "APPROVED"] },
          createdAt: { gte: dayStart },
        },
        _sum: { amount: true },
      });
      if ((today._sum.amount || 0) + value > req.user.depositLimitDaily) {
        return res.status(400).json({ error: "Günlük yatırım limitiniz aşıldı" });
      }
    }

    const riskScore = await scorePaymentRisk(req.user, value, "DEPOSIT");
    const payment = await prisma.paymentRequest.create({
      data: {
        userId: req.user.id,
        type: "DEPOSIT",
        amount: Number(value.toFixed(2)),
        method: String(method).trim(),
        note: note ? String(note).trim() : null,
        riskScore,
      },
    });
    res.status(201).json({ payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Yatırım talebi oluşturulamadı" });
  }
});

router.post("/withdraw", requireAuth, async (req, res) => {
  try {
    const { amount, method, note } = req.body || {};
    const value = Number(amount);
    if (!value || value <= 0) return res.status(400).json({ error: "Geçerli tutar girin" });
    if (!method) return res.status(400).json({ error: "Çekim yöntemi zorunlu" });

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet || wallet.withdrawable < value) {
      return res.status(400).json({ error: "Çekilebilir bakiye yetersiz" });
    }
    if (req.user.kycStatus !== "APPROVED" && value >= 2000) {
      return res.status(400).json({ error: "2.000 ₺ üzeri çekim için KYC onaylı olmalı" });
    }

    const riskScore = await scorePaymentRisk(req.user, value, "WITHDRAW");
    const canAuto =
      value <= AUTO_WITHDRAW_MAX && riskScore <= AUTO_RISK_MAX && req.user.kycStatus === "APPROVED";

    if (canAuto) {
      const result = await prisma.$transaction(async (tx) => {
        await adjustWallet(
          req.user.id,
          -value,
          "WITHDRAW",
          `Otomatik çekim onayı`,
          tx
        );
        return tx.paymentRequest.create({
          data: {
            userId: req.user.id,
            type: "WITHDRAW",
            amount: Number(value.toFixed(2)),
            method: String(method).trim(),
            note: note ? String(note).trim() : null,
            riskScore,
            status: "APPROVED",
            autoReview: true,
          },
        });
      });
      return res.status(201).json({ payment: result, autoApproved: true });
    }

    const payment = await prisma.paymentRequest.create({
      data: {
        userId: req.user.id,
        type: "WITHDRAW",
        amount: Number(value.toFixed(2)),
        method: String(method).trim(),
        note: note ? String(note).trim() : null,
        riskScore,
      },
    });
    res.status(201).json({ payment, autoApproved: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Çekim talebi oluşturulamadı" });
  }
});

module.exports = router;
