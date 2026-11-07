require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("./prisma");

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@jackpot.local";
  const password = process.env.ADMIN_PASSWORD || "Admin123!";

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email,
        name: "Yönetici",
        firstName: "Site",
        lastName: "Yonetici",
        role: "ADMIN",
        kycStatus: "APPROVED",
        vipLevel: "DIAMOND",
        passwordHash: await bcrypt.hash(password, 10),
        wallet: { create: { balance: 0, withdrawable: 0 } },
      },
    });
    console.log("Admin oluşturuldu:", email, "/", password);
  } else {
    console.log("Admin zaten var:", email);
  }

  const providers = ["Demo Sağlayıcı", "Pragmatic Play", "Evolution", "NetEnt", "Play'n GO"];
  for (const name of providers) {
    await prisma.gameProvider.upsert({
      where: { name },
      update: { active: true },
      create: { name, active: true },
    });
  }

  const demo = await prisma.gameProvider.findUnique({ where: { name: "Demo Sağlayıcı" } });
  const demos = [
    {
      name: "Lucky 7 Jackpot",
      category: "Slot",
      launchUrl: "/games/lucky7-slot/index.html",
      popular: true,
      featured: true,
      tags: ["jackpot", "wild", "freespin"],
      rtp: 96.2,
    },
    { name: "Lucky Reels Demo", category: "Slot", launchUrl: "/games/lucky7-slot/index.html", popular: true, tags: ["jackpot"] },
    { name: "Neon Roulette Demo", category: "Canlı Casino", launchUrl: "https://example.com", featured: true, tags: ["live"] },
    { name: "Ace Poker Demo", category: "Canlı Casino", launchUrl: "https://example.com", tags: ["live", "poker"] },
    { name: "Aviator Crash Demo", category: "Crash", launchUrl: "https://example.com", popular: true, tags: ["fast", "crash"] },
    { name: "Spaceman Demo", category: "Crash", launchUrl: "https://example.com", tags: ["fast"] },
  ];
  for (const g of demos) {
    const exists = await prisma.game.findFirst({ where: { name: g.name, providerId: demo.id } });
    if (!exists) {
      await prisma.game.create({
        data: {
          name: g.name,
          category: g.category,
          launchUrl: g.launchUrl,
          providerId: demo.id,
          active: true,
          popular: Boolean(g.popular),
          featured: Boolean(g.featured),
          tags: JSON.stringify(g.tags || []),
          rtp: g.rtp || 96.5,
        },
      });
    } else if (g.name === "Lucky Reels Demo" || g.name === "Lucky 7 Jackpot") {
      await prisma.game.update({
        where: { id: exists.id },
        data: {
          launchUrl: g.launchUrl,
          popular: Boolean(g.popular),
          featured: Boolean(g.featured),
          active: true,
        },
      });
    }
  }

  const methods = [
    { code: "HAVALE", name: "Havale/EFT", type: "LOCAL", minAmount: 50, maxAmount: 250000 },
    { code: "PAPARA", name: "Papara", type: "LOCAL", minAmount: 50, maxAmount: 100000 },
    { code: "USDT", name: "USDT (TRC20)", type: "CRYPTO", minAmount: 100, maxAmount: 500000 },
    { code: "BTC", name: "Bitcoin", type: "CRYPTO", minAmount: 200, maxAmount: 500000 },
    { code: "SKRILL", name: "Skrill", type: "EWALLET", minAmount: 50, maxAmount: 100000 },
  ];
  for (const m of methods) {
    await prisma.paymentMethod.upsert({
      where: { code: m.code },
      update: { active: true, name: m.name, minAmount: m.minAmount, maxAmount: m.maxAmount },
      create: { ...m, active: true, regions: JSON.stringify(["TR"]) },
    });
  }

  const welcome = await prisma.bonusTemplate.findFirst({ where: { autoTrigger: "WELCOME" } });
  if (!welcome) {
    await prisma.bonusTemplate.create({
      data: {
        name: "Hoş Geldin %100",
        type: "WELCOME",
        amount: 100,
        percent: 100,
        wagerMultiplier: 20,
        eligibleGames: JSON.stringify(["Slot"]),
        active: true,
        autoTrigger: "WELCOME",
      },
    });
  }

  const cashback = await prisma.bonusTemplate.findFirst({ where: { autoTrigger: "LOSS_CASHBACK" } });
  if (!cashback) {
    await prisma.bonusTemplate.create({
      data: {
        name: "Kayıp Cashback %10",
        type: "CASHBACK",
        amount: 0,
        percent: 10,
        wagerMultiplier: 5,
        eligibleGames: JSON.stringify(["Slot", "Crash"]),
        active: true,
        autoTrigger: "LOSS_CASHBACK",
      },
    });
  }

  await prisma.platformSetting.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      data: JSON.stringify({
        license: "Curaçao Demo 8048/JAZ2026",
        autoWithdrawMax: 1000,
        brand: "Jackpot",
      }),
    },
  });

  const canned = [
    {
      title: "Yatırım alındı",
      category: "YATIRIM",
      body: "Merhaba {{ad}}, yatırım talebiniz sistemimize ulaştı. En kısa sürede kontrol edilip bakiyenize yansıtılacaktır. İyi oyunlar dileriz.",
    },
    {
      title: "Yatırım onaylandı",
      category: "YATIRIM",
      body: "Sayın {{isim}}, yatırımınız onaylandı ve bakiyenize eklendi. Keyifli oyunlar!",
    },
    {
      title: "Çekim incelemede",
      category: "CEKIM",
      body: "Merhaba {{ad}}, çekim talebiniz güvenlik kontrolündedir. KYC doğrulamanız tamamsa işlem hızlanır. İlginiz için teşekkürler.",
    },
    {
      title: "Bonus bilgilendirme",
      category: "BONUS",
      body: "Merhaba {{ad}} ({{kullanici}}), bonus talebiniz kayda alındı. Çevrim şartları hesabınızda görüntülenir. Sorunuz olursa buradan yazabilirsiniz.",
    },
    {
      title: "Genel karşılama",
      category: "GENEL",
      body: "Merhaba {{ad}} {{soyad}}, Jackpot destek ekibine hoş geldiniz. Size nasıl yardımcı olabiliriz?",
    },
    {
      title: "KYC gerekli",
      category: "KYC",
      body: "Sayın {{isim}}, işleminizin devamı için kimlik doğrulama (KYC) belgelerini yüklemeniz gerekmektedir. KYC sayfasından iletebilirsiniz.",
    },
  ];
  for (const c of canned) {
    const exists = await prisma.cannedReply.findFirst({ where: { title: c.title } });
    if (!exists) await prisma.cannedReply.create({ data: c });
  }

  console.log("Seed tamamlandı.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
