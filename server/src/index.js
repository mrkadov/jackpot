require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const gamesRoutes = require("./routes/games");
const paymentsRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");
const playerRoutes = require("./routes/player");
const lucky7Routes = require("./routes/lucky7");

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = path.join(__dirname, "..", "..");

app.use(cors());
app.use(express.json({ limit: "3mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "jackpot-api", license: "Curacao-Demo", stack: "Jackpot-MVP" });
});

app.get("/api/public/trust", (_req, res) => {
  res.json({
    license: { name: "Curaçao eGaming (Demo)", number: "8048/JAZ2026" },
    infrastructure: "Jackpot Core / Cloudflare-ready",
    providers: ["Pragmatic Play", "Evolution", "NetEnt", "Play'n GO", "Demo Sağlayıcı"],
    payments: ["Papara", "Havale/EFT", "USDT", "BTC", "Skrill"],
    responsibleGaming: true,
    ssl: true,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/player", playerRoutes);
app.use("/api/games/lucky7", lucky7Routes);
app.use("/api/admin", adminRoutes);

app.use(express.static(rootDir));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Jackpot API http://0.0.0.0:${PORT}`);
});
