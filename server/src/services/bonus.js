const prisma = require("../prisma");
const { adjustWallet } = require("./wallet");

async function grantBonus(userId, templateOrData, note) {
  const isTemplate = Boolean(templateOrData.id && templateOrData.name);
  const name = isTemplate ? templateOrData.name : templateOrData.name;
  const type = isTemplate ? templateOrData.type : templateOrData.type;
  const amount = Number(isTemplate ? templateOrData.amount : templateOrData.amount);
  const wagerMultiplier = Number(
    isTemplate ? templateOrData.wagerMultiplier : templateOrData.wagerMultiplier || 20
  );

  return prisma.$transaction(async (tx) => {
    await adjustWallet(userId, amount, "ADJUST", note || `Bonus: ${name}`, tx);
    await tx.wallet.update({
      where: { userId },
      data: { bonusBalance: { increment: amount } },
    });
    return tx.userBonus.create({
      data: {
        userId,
        templateId: isTemplate ? templateOrData.id : null,
        name,
        type,
        amount,
        wagerRequired: Number((amount * wagerMultiplier).toFixed(2)),
        wagerProgress: 0,
        status: "ACTIVE",
      },
    });
  });
}

async function runAutoTriggers(userId, event, meta = {}) {
  const templates = await prisma.bonusTemplate.findMany({
    where: { active: true, autoTrigger: { not: null } },
  });
  const granted = [];
  for (const t of templates) {
    if (t.autoTrigger === event) {
      if (event === "LOSS_CASHBACK" && meta.lossAmount && meta.lossAmount >= 5000) {
        const amount = Number(((meta.lossAmount * (t.percent || 10)) / 100).toFixed(2));
        granted.push(
          await grantBonus(
            userId,
            { ...t, amount },
            `Otomatik cashback %${t.percent || 10}`
          )
        );
      }
      if (event === "WELCOME") {
        granted.push(await grantBonus(userId, t, "Hoş geldin bonusu"));
      }
      if (event === "BIRTHDAY_FREESPIN" && t.type === "FREESPIN") {
        granted.push(await grantBonus(userId, t, "Doğum günü freespin"));
      }
    }
  }
  return granted;
}

module.exports = { grantBonus, runAutoTriggers };
