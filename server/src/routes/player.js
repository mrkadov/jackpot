const express = require("express");
const prisma = require("../prisma");
const { requireAuth, publicUser } = require("../middleware/auth");
const { runAutoTriggers } = require("../services/bonus");
const { SUPPORT_CATEGORIES } = require("../utils/personalize");

const router = express.Router();

router.get("/bonuses", requireAuth, async (req, res) => {
  const bonuses = await prisma.userBonus.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bonuses });
});

router.get("/kyc", requireAuth, async (req, res) => {
  const docs = await prisma.kycDocument.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      docType: true,
      fileName: true,
      status: true,
      reviewNote: true,
      createdAt: true,
    },
  });
  res.json({ kycStatus: req.user.kycStatus, docs });
});

router.post("/kyc", requireAuth, async (req, res) => {
  try {
    const { docType, fileName, fileData } = req.body || {};
    if (!docType || !fileName || !fileData) {
      return res.status(400).json({ error: "Belge tipi, dosya adı ve veri zorunlu" });
    }
    if (String(fileData).length > 2_500_000) {
      return res.status(400).json({ error: "Dosya çok büyük (max ~1.5MB)" });
    }
    const doc = await prisma.kycDocument.create({
      data: {
        userId: req.user.id,
        docType: String(docType),
        fileName: String(fileName),
        fileData: String(fileData),
      },
    });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { kycStatus: "PENDING" },
    });
    res.status(201).json({
      doc: {
        id: doc.id,
        docType: doc.docType,
        fileName: doc.fileName,
        status: doc.status,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "KYC yükleme başarısız" });
  }
});

router.get("/support/categories", (_req, res) => {
  res.json({ categories: SUPPORT_CATEGORIES });
});

router.get("/support", requireAuth, async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: req.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ tickets });
});

router.get("/support/:id", requireAuth, async (req, res) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket bulunamadı" });
  res.json({ ticket });
});

router.post("/support", requireAuth, async (req, res) => {
  try {
    const { subject, message, category, ticketId } = req.body || {};
    if (!message) return res.status(400).json({ error: "Mesaj zorunlu" });
    const cat = String(category || "GENEL").trim().toUpperCase();
    const catMeta = SUPPORT_CATEGORIES.find((c) => c.code === cat);
    const vipOnly = ["GOLD", "PLATINUM", "DIAMOND"].includes(req.user.vipLevel);

    let ticket = null;
    if (ticketId) {
      ticket = await prisma.supportTicket.findFirst({
        where: { id: ticketId, userId: req.user.id },
      });
    }
    if (!ticket) {
      ticket = await prisma.supportTicket.findFirst({
        where: {
          userId: req.user.id,
          category: cat,
          status: { in: ["OPEN", "ANSWERED"] },
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (ticket) {
      await prisma.supportMessage.create({
        data: { ticketId: ticket.id, sender: "USER", body: String(message).trim() },
      });
      ticket = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "OPEN", updatedAt: new Date() },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return res.status(201).json({ ticket });
    }

    ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user.id,
        subject: String(subject || catMeta?.label || "Canlı Destek").trim(),
        category: cat,
        vipOnly,
        messages: {
          create: { sender: "USER", body: String(message).trim() },
        },
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.status(201).json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Destek talebi açılamadı" });
  }
});

router.post("/support/:id/message", requireAuth, async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket bulunamadı" });
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: "Mesaj zorunlu" });
    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, sender: "USER", body: String(message).trim() },
    });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "OPEN", updatedAt: new Date() },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.status(201).json({ ticket: updated });
  } catch (err) {
    res.status(500).json({ error: "Mesaj gönderilemedi" });
  }
});

router.get("/profile", requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post("/claim-welcome", requireAuth, async (req, res) => {
  try {
    const existing = await prisma.userBonus.findFirst({
      where: { userId: req.user.id, type: "WELCOME" },
    });
    if (existing) return res.status(400).json({ error: "Hoş geldin bonusu zaten alınmış" });
    const granted = await runAutoTriggers(req.user.id, "WELCOME");
    if (!granted.length) {
      return res.status(404).json({ error: "Aktif hoş geldin kampanyası yok" });
    }
    res.json({ bonuses: granted });
  } catch (err) {
    res.status(500).json({ error: "Bonus alınamadı" });
  }
});

module.exports = router;
