const prisma = require("../prisma");

async function adjustWallet(userId, amount, type, note, txClient = prisma) {
  const wallet = await txClient.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error("Cüzdan bulunamadı");

  const nextBalance = Number((wallet.balance + amount).toFixed(2));
  if (nextBalance < 0) throw new Error("Yetersiz bakiye");

  let nextWithdrawable = wallet.withdrawable;
  if (type === "DEPOSIT" || (type === "ADJUST" && amount > 0) || type === "WIN") {
    nextWithdrawable = Number((wallet.withdrawable + Math.max(amount, 0)).toFixed(2));
  }
  if (type === "WITHDRAW" || (type === "ADJUST" && amount < 0) || type === "BET") {
    nextWithdrawable = Number(
      Math.max(0, wallet.withdrawable + Math.min(amount, 0)).toFixed(2)
    );
  }
  if (nextWithdrawable > nextBalance) nextWithdrawable = nextBalance;

  const updated = await txClient.wallet.update({
    where: { userId },
    data: {
      balance: nextBalance,
      withdrawable: nextWithdrawable,
    },
  });

  const transaction = await txClient.transaction.create({
    data: {
      userId,
      type,
      amount,
      balanceAfter: nextBalance,
      note: note || null,
    },
  });

  return { wallet: updated, transaction };
}

module.exports = { adjustWallet };
