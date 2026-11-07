const jwt = require("jsonwebtoken");
const prisma = require("../prisma");

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Oturum gerekli" });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { wallet: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ error: "Hesap geçersiz veya askıda" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Geçersiz oturum" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Yönetici yetkisi gerekli" });
  }
  next();
}

function maskTc(tc) {
  if (!tc || tc.length < 5) return tc || null;
  return `${tc.slice(0, 3)}*****${tc.slice(-3)}`;
}

function publicUser(user, opts = {}) {
  const reveal = Boolean(opts.revealSensitive);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    tcKimlik: reveal ? user.tcKimlik || null : maskTc(user.tcKimlik),
    birthDate: user.birthDate || null,
    phone: user.phone || null,
    gender: user.gender || null,
    address: user.address || null,
    city: user.city || null,
    district: user.district || null,
    postalCode: user.postalCode || null,
    role: user.role,
    status: user.status,
    vipLevel: user.vipLevel || "BRONZE",
    kycStatus: user.kycStatus || "NONE",
    depositLimitDaily: user.depositLimitDaily ?? null,
    lossLimitDaily: user.lossLimitDaily ?? null,
    affiliateCode: user.affiliateCode || null,
    createdAt: user.createdAt,
    wallet: user.wallet
      ? {
          balance: user.wallet.balance,
          bonusBalance: user.wallet.bonusBalance,
          withdrawable: user.wallet.withdrawable,
        }
      : null,
  };
}

module.exports = { signToken, requireAuth, requireAdmin, publicUser };
