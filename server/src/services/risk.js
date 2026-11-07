const prisma = require("../prisma");

function parseJson(value, fallback = []) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function scorePaymentRisk(user, amount, type) {
  let score = 0;
  const flags = parseJson(user.riskFlags, []);

  if (user.kycStatus !== "APPROVED") score += 25;
  if (type === "WITHDRAW" && amount >= 5000) score += 30;
  if (type === "WITHDRAW" && amount >= 20000) score += 25;
  if (user.riskScore >= 50) score += 20;
  if (flags.includes("MULTI_ACCOUNT")) score += 40;
  if (flags.includes("BONUS_ABUSE")) score += 35;

  const recentWithdraws = await prisma.paymentRequest.count({
    where: {
      userId: user.id,
      type: "WITHDRAW",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recentWithdraws >= 3) score += 20;

  return Math.min(100, score);
}

async function detectMultiAccount(ip, fingerprint, excludeUserId) {
  if (!ip && !fingerprint) return [];
  const matches = await prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      OR: [
        ip ? { lastIp: ip } : undefined,
        fingerprint ? { deviceFingerprint: fingerprint } : undefined,
      ].filter(Boolean),
    },
    select: { id: true, email: true, name: true },
    take: 10,
  });
  return matches;
}

async function raiseRiskAlert(userId, type, message, severity = "MEDIUM") {
  return prisma.riskAlert.create({
    data: { userId, type, message, severity },
  });
}

async function applyMultiAccountFlag(userId, matches) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const flags = new Set(parseJson(user.riskFlags, []));
  flags.add("MULTI_ACCOUNT");
  await prisma.user.update({
    where: { id: userId },
    data: {
      riskScore: Math.min(100, user.riskScore + 30),
      riskFlags: JSON.stringify([...flags]),
    },
  });
  await raiseRiskAlert(
    userId,
    "MULTI_ACCOUNT",
    `Olası çoklu hesap: ${matches.map((m) => m.email).join(", ")}`,
    "HIGH"
  );
}

module.exports = {
  scorePaymentRisk,
  detectMultiAccount,
  raiseRiskAlert,
  applyMultiAccountFlag,
  parseJson,
};
