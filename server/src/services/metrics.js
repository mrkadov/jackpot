const prisma = require("../prisma");

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function computeDashboard() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = daysAgo(7);
  const since30d = daysAgo(30);

  const [
    users,
    activeGames,
    pendingPayments,
    pendingKyc,
    openAlerts,
    openTickets,
    walletSum,
    deposits,
    withdraws,
    adjusts,
    sessionsLive,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.game.count({ where: { active: true } }),
    prisma.paymentRequest.count({ where: { status: "PENDING" } }),
    prisma.kycDocument.count({ where: { status: "PENDING" } }),
    prisma.riskAlert.count({ where: { resolved: false } }),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.wallet.aggregate({ _sum: { balance: true, bonusBalance: true } }),
    prisma.transaction.aggregate({
      where: { type: "DEPOSIT", createdAt: { gte: since30d } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "WITHDRAW", createdAt: { gte: since30d } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "ADJUST", createdAt: { gte: since30d } },
      _sum: { amount: true },
    }),
    prisma.gameSession.count({ where: { startedAt: { gte: since24h } } }),
  ]);

  const depositTotal = deposits._sum.amount || 0;
  const withdrawTotal = Math.abs(withdraws._sum.amount || 0);
  const bonusCost = Math.max(0, adjusts._sum.amount || 0);
  const ggr = Number((depositTotal - withdrawTotal).toFixed(2));
  const ngr = Number((ggr - bonusCost).toFixed(2));

  // daily series last 7 days
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const from = daysAgo(i);
    const to = daysAgo(i - 1);
    const [d, w] = await Promise.all([
      prisma.transaction.aggregate({
        where: { type: "DEPOSIT", createdAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: "WITHDRAW", createdAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
    ]);
    const dayGgr = (d._sum.amount || 0) - Math.abs(w._sum.amount || 0);
    series.push({
      date: from.toISOString().slice(0, 10),
      ggr: Number(dayGgr.toFixed(2)),
      deposits: d._sum.amount || 0,
      withdraws: Math.abs(w._sum.amount || 0),
    });
  }

  return {
    stats: {
      users,
      activeGames,
      pendingPayments,
      pendingKyc,
      openAlerts,
      openTickets,
      onlineApprox: sessionsLive,
      totalBalance: walletSum._sum.balance || 0,
      totalBonus: walletSum._sum.bonusBalance || 0,
      ggr30d: ggr,
      ngr30d: ngr,
      deposit30d: depositTotal,
      withdraw30d: withdrawTotal,
    },
    series,
    since7d: since7d.toISOString(),
  };
}

module.exports = { computeDashboard, startOfDay };
