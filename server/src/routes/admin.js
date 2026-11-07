const express = require("express");
const prisma = require("../prisma");
const { requireAuth, requireAdmin, publicUser } = require("../middleware/auth");
const { adjustWallet } = require("../services/wallet");
const { computeDashboard } = require("../services/metrics");
const { grantBonus } = require("../services/bonus");
const { raiseRiskAlert, parseJson } = require("../services/risk");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/dashboard", async (_req, res) => {
  res.json(await computeDashboard());
});

router.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { wallet: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users: users.map((u) => publicUser(u, { revealSensitive: true })) });
});

router.get("/users/:id", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      wallet: true,
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
      payments: { orderBy: { createdAt: "desc" }, take: 50 },
      bonuses: { orderBy: { createdAt: "desc" } },
      kycDocuments: { orderBy: { createdAt: "desc" } },
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 20,
        include: { game: { include: { provider: true } } },
      },
      supportTickets: {
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
      riskAlerts: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) return res.status(404).json({ error: "Kullanıcı yok" });
  const profile = publicUser(user, { revealSensitive: true });
  res.json({
    user: {
      ...profile,
      riskScore: user.riskScore,
      riskFlags: parseJson(user.riskFlags, []),
      tags: parseJson(user.tags, []),
      vipLevel: user.vipLevel,
      kycStatus: user.kycStatus,
      depositLimitDaily: user.depositLimitDaily,
      lossLimitDaily: user.lossLimitDaily,
      lastIp: user.lastIp,
      affiliateCode: user.affiliateCode,
      referredBy: user.referredBy,
    },
    wallet: user.wallet,
    transactions: user.transactions,
    payments: user.payments,
    bonuses: user.bonuses,
    kycDocuments: user.kycDocuments.map((d) => ({
      id: d.id,
      docType: d.docType,
      fileName: d.fileName,
      status: d.status,
      reviewNote: d.reviewNote,
      createdAt: d.createdAt,
      fileData: d.fileData,
    })),
    sessions: user.sessions,
    supportTickets: user.supportTickets,
    riskAlerts: user.riskAlerts,
  });
});

router.patch("/users/:id", async (req, res) => {
  try {
    const {
      status,
      vipLevel,
      tags,
      depositLimitDaily,
      lossLimitDaily,
      riskScore,
    } = req.body || {};
    const data = {};
    if (status) data.status = status;
    if (vipLevel) data.vipLevel = vipLevel;
    if (tags) data.tags = JSON.stringify(tags);
    if (depositLimitDaily !== undefined) data.depositLimitDaily = depositLimitDaily;
    if (lossLimitDaily !== undefined) data.lossLimitDaily = lossLimitDaily;
    if (riskScore !== undefined) data.riskScore = Number(riskScore);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: { wallet: true },
    });
    res.json({ user: publicUser(user, { revealSensitive: true }) });
  } catch {
    res.status(400).json({ error: "Kullanıcı güncellenemedi" });
  }
});

router.post("/wallet/adjust", async (req, res) => {
  try {
    const { userId, amount, note } = req.body || {};
    const value = Number(amount);
    if (!userId || Number.isNaN(value) || value === 0) {
      return res.status(400).json({ error: "userId ve sıfır olmayan tutar gerekli" });
    }
    const result = await prisma.$transaction(async (tx) =>
      adjustWallet(userId, Number(value.toFixed(2)), "ADJUST", note || "Admin düzeltme", tx)
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Bakiye güncellenemedi" });
  }
});

router.get("/payments", async (req, res) => {
  const status = req.query.status || undefined;
  const type = req.query.type || undefined;
  const payments = await prisma.paymentRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
    include: { user: { select: { id: true, email: true, name: true, vipLevel: true, kycStatus: true } } },
    orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  res.json({ payments });
});

router.post("/payments/:id/approve", async (req, res) => {
  try {
    const payment = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: "Talep bulunamadı" });
    if (payment.status !== "PENDING") return res.status(400).json({ error: "Talep zaten işlenmiş" });

    const result = await prisma.$transaction(async (tx) => {
      if (payment.type === "DEPOSIT") {
        await adjustWallet(payment.userId, payment.amount, "DEPOSIT", `Yatırım onayı #${payment.id}`, tx);
      } else {
        await adjustWallet(payment.userId, -payment.amount, "WITHDRAW", `Çekim onayı #${payment.id}`, tx);
      }
      return tx.paymentRequest.update({
        where: { id: payment.id },
        data: { status: "APPROVED" },
      });
    });
    res.json({ payment: result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Onay başarısız" });
  }
});

router.post("/payments/:id/reject", async (req, res) => {
  try {
    const payment = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: "Talep bulunamadı" });
    if (payment.status !== "PENDING") return res.status(400).json({ error: "Talep zaten işlenmiş" });
    const updated = await prisma.paymentRequest.update({
      where: { id: payment.id },
      data: { status: "REJECTED" },
    });
    res.json({ payment: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || "Red başarısız" });
  }
});

router.get("/payment-methods", async (_req, res) => {
  res.json({ methods: await prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }) });
});

router.post("/payment-methods", async (req, res) => {
  try {
    const { code, name, type, minAmount, maxAmount, feePercent, active, regions } = req.body || {};
    const method = await prisma.paymentMethod.create({
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        type: String(type || "LOCAL"),
        minAmount: Number(minAmount || 50),
        maxAmount: Number(maxAmount || 100000),
        feePercent: Number(feePercent || 0),
        active: active !== false,
        regions: JSON.stringify(regions || ["TR"]),
      },
    });
    res.status(201).json({ method });
  } catch {
    res.status(400).json({ error: "Ödeme yöntemi eklenemedi" });
  }
});

router.put("/payment-methods/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const method = await prisma.paymentMethod.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.minAmount !== undefined ? { minAmount: Number(body.minAmount) } : {}),
        ...(body.maxAmount !== undefined ? { maxAmount: Number(body.maxAmount) } : {}),
        ...(body.feePercent !== undefined ? { feePercent: Number(body.feePercent) } : {}),
      },
    });
    res.json({ method });
  } catch {
    res.status(400).json({ error: "Güncellenemedi" });
  }
});

router.get("/kyc", async (_req, res) => {
  const docs = await prisma.kycDocument.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({
    docs: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      fileName: d.fileName,
      status: d.status,
      reviewNote: d.reviewNote,
      createdAt: d.createdAt,
      user: d.user,
      fileData: d.fileData,
    })),
  });
});

router.post("/kyc/:id/review", async (req, res) => {
  try {
    const { status, reviewNote } = req.body || {};
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "status APPROVED veya REJECTED olmalı" });
    }
    const doc = await prisma.kycDocument.update({
      where: { id: req.params.id },
      data: { status, reviewNote: reviewNote || null },
    });
    if (status === "APPROVED") {
      await prisma.user.update({ where: { id: doc.userId }, data: { kycStatus: "APPROVED" } });
    } else {
      const pending = await prisma.kycDocument.count({
        where: { userId: doc.userId, status: "PENDING" },
      });
      if (!pending) {
        await prisma.user.update({ where: { id: doc.userId }, data: { kycStatus: "REJECTED" } });
      }
    }
    res.json({ doc });
  } catch {
    res.status(400).json({ error: "KYC incelemesi başarısız" });
  }
});

router.get("/providers", async (_req, res) => {
  const providers = await prisma.gameProvider.findMany({
    include: { _count: { select: { games: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ providers });
});

router.post("/providers", async (req, res) => {
  try {
    const { name, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "Sağlayıcı adı zorunlu" });
    const provider = await prisma.gameProvider.create({
      data: { name: String(name).trim(), active: Boolean(active) },
    });
    res.status(201).json({ provider });
  } catch {
    res.status(400).json({ error: "Sağlayıcı eklenemedi" });
  }
});

router.get("/games", async (_req, res) => {
  const games = await prisma.game.findMany({
    include: { provider: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ games });
});

router.post("/games", async (req, res) => {
  try {
    const {
      providerId, name, category, thumbnail, launchUrl, active = true,
      rtp, featured, popular, tags,
    } = req.body || {};
    if (!providerId || !name || !launchUrl) {
      return res.status(400).json({ error: "providerId, name ve launchUrl zorunlu" });
    }
    const game = await prisma.game.create({
      data: {
        providerId,
        name: String(name).trim(),
        category: category ? String(category).trim() : "Slot",
        thumbnail: thumbnail || null,
        launchUrl: String(launchUrl).trim(),
        active: Boolean(active),
        rtp: Number(rtp || 96),
        featured: Boolean(featured),
        popular: Boolean(popular),
        tags: JSON.stringify(tags || []),
      },
      include: { provider: true },
    });
    res.status(201).json({ game });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Oyun eklenemedi" });
  }
});

router.put("/games/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const game = await prisma.game.update({
      where: { id: req.params.id },
      data: {
        ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
        ...(b.category !== undefined ? { category: String(b.category).trim() } : {}),
        ...(b.thumbnail !== undefined ? { thumbnail: b.thumbnail } : {}),
        ...(b.launchUrl !== undefined ? { launchUrl: String(b.launchUrl).trim() } : {}),
        ...(b.active !== undefined ? { active: Boolean(b.active) } : {}),
        ...(b.providerId !== undefined ? { providerId: b.providerId } : {}),
        ...(b.rtp !== undefined ? { rtp: Number(b.rtp) } : {}),
        ...(b.featured !== undefined ? { featured: Boolean(b.featured) } : {}),
        ...(b.popular !== undefined ? { popular: Boolean(b.popular) } : {}),
        ...(b.tags !== undefined ? { tags: JSON.stringify(b.tags) } : {}),
      },
      include: { provider: true },
    });
    res.json({ game });
  } catch {
    res.status(400).json({ error: "Oyun güncellenemedi" });
  }
});

router.delete("/games/:id", async (req, res) => {
  try {
    await prisma.game.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Oyun silinemedi" });
  }
});

router.get("/bonuses/templates", async (_req, res) => {
  res.json({ templates: await prisma.bonusTemplate.findMany({ orderBy: { createdAt: "desc" } }) });
});

router.post("/bonuses/templates", async (req, res) => {
  try {
    const b = req.body || {};
    const template = await prisma.bonusTemplate.create({
      data: {
        name: String(b.name).trim(),
        type: String(b.type || "DEPOSIT"),
        amount: Number(b.amount || 0),
        percent: Number(b.percent || 0),
        wagerMultiplier: Number(b.wagerMultiplier || 20),
        eligibleGames: JSON.stringify(b.eligibleGames || ["Slot"]),
        active: b.active !== false,
        autoTrigger: b.autoTrigger || null,
      },
    });
    res.status(201).json({ template });
  } catch {
    res.status(400).json({ error: "Bonus şablonu eklenemedi" });
  }
});

router.post("/bonuses/grant", async (req, res) => {
  try {
    const { userId, templateId, name, type, amount, wagerMultiplier } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId zorunlu" });
    let payload;
    if (templateId) {
      payload = await prisma.bonusTemplate.findUnique({ where: { id: templateId } });
      if (!payload) return res.status(404).json({ error: "Şablon yok" });
    } else {
      payload = {
        name: name || "Manuel Bonus",
        type: type || "MANUAL",
        amount: Number(amount || 0),
        wagerMultiplier: Number(wagerMultiplier || 20),
      };
    }
    const bonus = await grantBonus(userId, payload, "Admin bonus tanımı");
    res.status(201).json({ bonus });
  } catch (err) {
    res.status(400).json({ error: err.message || "Bonus verilemedi" });
  }
});

router.get("/risk/alerts", async (_req, res) => {
  const alerts = await prisma.riskAlert.findMany({
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ alerts });
});

router.post("/risk/alerts/:id/resolve", async (req, res) => {
  const alert = await prisma.riskAlert.update({
    where: { id: req.params.id },
    data: { resolved: true },
  });
  res.json({ alert });
});

router.post("/risk/freeze/:userId", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { status: "SUSPENDED" },
  });
  await raiseRiskAlert(user.id, "MANUAL_FREEZE", "Hesap admin tarafından donduruldu", "HIGH");
  res.json({ user: publicUser(user, { revealSensitive: true }) });
});

router.get("/affiliates", async (_req, res) => {
  const affiliates = await prisma.affiliate.findMany({
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ affiliates });
});

router.post("/affiliates", async (req, res) => {
  try {
    const { userId, code, commissionType, rate } = req.body || {};
    const affiliate = await prisma.affiliate.create({
      data: {
        userId,
        code: String(code || `AFF${Date.now().toString(36).toUpperCase()}`),
        commissionType: commissionType || "RevShare",
        rate: Number(rate || 25),
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { affiliateCode: affiliate.code },
    });
    res.status(201).json({ affiliate });
  } catch {
    res.status(400).json({ error: "Affiliate oluşturulamadı" });
  }
});

const { personalize, SUPPORT_CATEGORIES } = require("../utils/personalize");

router.get("/support/categories", (_req, res) => {
  res.json({ categories: SUPPORT_CATEGORIES });
});

router.get("/support", async (_req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          vipLevel: true,
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json({ tickets });
});

router.get("/support/:id", async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          vipLevel: true,
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket yok" });
  res.json({ ticket });
});

router.post("/support/:id/reply", async (req, res) => {
  try {
    const { message, cannedId } = req.body || {};
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket yok" });

    let body = message;
    if (cannedId) {
      const canned = await prisma.cannedReply.findUnique({ where: { id: cannedId } });
      if (!canned) return res.status(404).json({ error: "Hazır cevap yok" });
      body = personalize(canned.body, ticket.user);
    }
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: "Mesaj zorunlu" });
    }

    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, sender: "ADMIN", body: String(body).trim() },
    });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "ANSWERED" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            vipLevel: true,
          },
        },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    res.status(201).json({ ticket: updated, preview: String(body).trim() });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Yanıt gönderilemedi" });
  }
});

router.get("/canned-replies", async (req, res) => {
  const category = req.query.category;
  const replies = await prisma.cannedReply.findMany({
    where: {
      active: true,
      ...(category ? { OR: [{ category: String(category) }, { category: "GENEL" }] } : {}),
    },
    orderBy: { title: "asc" },
  });
  res.json({ replies });
});

router.get("/canned-replies/all", async (_req, res) => {
  const replies = await prisma.cannedReply.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ replies });
});

router.post("/canned-replies", async (req, res) => {
  try {
    const { title, category, body, active = true } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: "Başlık ve metin zorunlu" });
    const reply = await prisma.cannedReply.create({
      data: {
        title: String(title).trim(),
        category: String(category || "GENEL").trim().toUpperCase(),
        body: String(body),
        active: Boolean(active),
      },
    });
    res.status(201).json({ reply });
  } catch {
    res.status(400).json({ error: "Hazır cevap eklenemedi" });
  }
});

router.put("/canned-replies/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const reply = await prisma.cannedReply.update({
      where: { id: req.params.id },
      data: {
        ...(b.title !== undefined ? { title: String(b.title).trim() } : {}),
        ...(b.category !== undefined ? { category: String(b.category).trim().toUpperCase() } : {}),
        ...(b.body !== undefined ? { body: String(b.body) } : {}),
        ...(b.active !== undefined ? { active: Boolean(b.active) } : {}),
      },
    });
    res.json({ reply });
  } catch {
    res.status(400).json({ error: "Güncellenemedi" });
  }
});

router.delete("/canned-replies/:id", async (req, res) => {
  try {
    await prisma.cannedReply.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Silinemedi" });
  }
});

router.post("/canned-replies/preview", async (req, res) => {
  try {
    const { body, userId, cannedId } = req.body || {};
    let text = body;
    if (cannedId) {
      const canned = await prisma.cannedReply.findUnique({ where: { id: cannedId } });
      if (!canned) return res.status(404).json({ error: "Hazır cevap yok" });
      text = canned.body;
    }
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null;
    res.json({ preview: personalize(text || "", user || {}) });
  } catch {
    res.status(400).json({ error: "Önizleme başarısız" });
  }
});

module.exports = router;
