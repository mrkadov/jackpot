const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");
const { signToken, requireAuth, publicUser } = require("../middleware/auth");
const {
  validateTCKN,
  validatePhoneTR,
  normalizePhone,
  isAdult,
} = require("../utils/validate");
const { detectMultiAccount, applyMultiAccountFlag } = require("../services/risk");
const { runAutoTriggers } = require("../services/bonus");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      passwordConfirm,
      firstName,
      lastName,
      tcKimlik,
      birthDate,
      phone,
      gender,
      address,
      city,
      district,
      postalCode,
      acceptTerms,
      deviceFingerprint,
      ref,
    } = req.body || {};
    const lastIp =
      req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "Ad, soyad, e-posta ve şifre zorunlu" });
    }
    if (passwordConfirm !== undefined && password !== passwordConfirm) {
      return res.status(400).json({ error: "Şifreler eşleşmiyor" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Şifre en az 6 karakter olmalı" });
    }
    if (!tcKimlik || !validateTCKN(tcKimlik)) {
      return res.status(400).json({ error: "Geçerli bir TC Kimlik No girin" });
    }
    if (!birthDate || !isAdult(birthDate, 18)) {
      return res.status(400).json({ error: "18 yaşından büyük olmalısınız" });
    }
    if (!phone || !validatePhoneTR(phone)) {
      return res.status(400).json({ error: "Geçerli bir cep telefonu girin (05xx...)" });
    }
    if (!gender || !["Erkek", "Kadın", "Belirtmek istemiyorum"].includes(gender)) {
      return res.status(400).json({ error: "Cinsiyet seçimi zorunlu" });
    }
    if (!address || String(address).trim().length < 10) {
      return res.status(400).json({ error: "Açık adres en az 10 karakter olmalı" });
    }
    if (!city || !district) {
      return res.status(400).json({ error: "İl ve ilçe seçimi zorunlu" });
    }
    if (!acceptTerms) {
      return res.status(400).json({ error: "Üyelik sözleşmesini kabul etmelisiniz" });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const tcNorm = String(tcKimlik).trim();
    const phoneNorm = normalizePhone(phone);

    const emailExists = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (emailExists) return res.status(409).json({ error: "Bu e-posta zaten kayıtlı" });

    const tcExists = await prisma.user.findUnique({ where: { tcKimlik: tcNorm } });
    if (tcExists) return res.status(409).json({ error: "Bu TC Kimlik No zaten kayıtlı" });

    const first = String(firstName).trim();
    const last = String(lastName).trim();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        passwordHash,
        firstName: first,
        lastName: last,
        name: `${first} ${last}`,
        tcKimlik: tcNorm,
        birthDate: String(birthDate),
        phone: phoneNorm,
        gender: String(gender),
        address: String(address).trim(),
        city: String(city).trim(),
        district: String(district).trim(),
        postalCode: postalCode ? String(postalCode).trim() : null,
        lastIp,
        deviceFingerprint: deviceFingerprint ? String(deviceFingerprint).slice(0, 120) : null,
        referredBy: ref ? String(ref).trim() : null,
        wallet: { create: {} },
      },
      include: { wallet: true },
    });

    const matches = await detectMultiAccount(
      lastIp,
      deviceFingerprint ? String(deviceFingerprint).slice(0, 120) : null,
      user.id
    );
    if (matches.length) await applyMultiAccountFlag(user.id, matches);

    if (ref) {
      const aff = await prisma.affiliate.findUnique({ where: { code: String(ref).trim() } });
      if (aff) {
        await prisma.affiliate.update({
          where: { id: aff.id },
          data: { signups: { increment: 1 } },
        });
      }
    }

    try {
      await runAutoTriggers(user.id, "WELCOME");
    } catch (_) {
      /* optional welcome */
    }

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallet: true },
    });
    const token = signToken(fresh);
    res.status(201).json({ token, user: publicUser(fresh) });
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return res.status(409).json({ error: "E-posta veya TC Kimlik No zaten kayıtlı" });
    }
    res.status(500).json({ error: "Kayıt başarısız" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "E-posta ve şifre zorunlu" });
    }
    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      include: { wallet: true },
    });
    if (!user) return res.status(401).json({ error: "Geçersiz bilgiler" });
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Hesap askıya alınmış" });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Geçersiz bilgiler" });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Giriş başarısız" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
