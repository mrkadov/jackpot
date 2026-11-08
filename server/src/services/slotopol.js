const BASE = process.env.SLOTOPOL_URL || "http://127.0.0.1:8080";
const EMAIL = process.env.SLOTOPOL_EMAIL || "player@example.org";
const SECRET = process.env.SLOTOPOL_SECRET || "iVI05M";
const ADMIN_EMAIL = process.env.SLOTOPOL_ADMIN_EMAIL || "admin@example.org";
const ADMIN_SECRET = process.env.SLOTOPOL_ADMIN_SECRET || "0YBoaT";
const CLUB_ID = Number(process.env.SLOTOPOL_CLUB_ID || 1);
const PLAYER_UID = Number(process.env.SLOTOPOL_UID || 3);

let accessToken = null;
let adminToken = null;
let tokenExpireAt = 0;
let queue = Promise.resolve();

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.what || data.error || `Slotopol ${res.status}`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function signIn(email, secret) {
  return request("/signin", {
    method: "POST",
    body: { email, secret },
  });
}

async function ensurePlayerToken() {
  if (accessToken && Date.now() < tokenExpireAt - 60_000) return accessToken;
  const data = await signIn(EMAIL, SECRET);
  accessToken = data.access;
  tokenExpireAt = data.expire ? Date.parse(data.expire) : Date.now() + 12 * 3600_000;
  return accessToken;
}

async function ensureAdminToken() {
  if (adminToken) return adminToken;
  const data = await signIn(ADMIN_EMAIL, ADMIN_SECRET);
  adminToken = data.access;
  return adminToken;
}

async function ensureWallet(minBalance = 10000) {
  const token = await ensurePlayerToken();
  const props = await request("/prop/wallet/get", {
    method: "POST",
    token,
    body: { cid: CLUB_ID, uid: PLAYER_UID },
  });
  if ((props.wallet || 0) >= minBalance) return props.wallet;
  const admin = await ensureAdminToken();
  const add = await request("/prop/wallet/add", {
    method: "POST",
    token: admin,
    body: { cid: CLUB_ID, uid: PLAYER_UID, sum: Math.max(minBalance * 2, 50000) },
  });
  return add.wallet;
}

async function health() {
  try {
    const info = await request("/servinfo");
    return { ok: true, version: info.buildvers || info.buildVers || "ok" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function newGame(alias) {
  return enqueue(async () => {
    await ensureWallet(20000);
    const token = await ensurePlayerToken();
    return request("/game/new", {
      method: "POST",
      token,
      body: { cid: CLUB_ID, uid: PLAYER_UID, alias },
    });
  });
}

async function spin(gid, bet, sel) {
  return enqueue(async () => {
    await ensureWallet(Math.max(bet * sel * 20, 5000));
    const token = await ensurePlayerToken();
    return request("/slot/spin", {
      method: "POST",
      token,
      body: { gid, bet, sel },
    });
  });
}

const CATALOG = [
  {
    alias: "novomatic/jokerdolphin",
    name: "Joker Dolphin",
    provider: "Novomatic",
    defaultSel: 9,
    rtp: 96.0,
  },
  {
    alias: "novomatic/bookofra",
    name: "Book of Ra",
    provider: "Novomatic",
    defaultSel: 9,
    rtp: 95.1,
  },
  {
    alias: "novomatic/bookofradeluxe",
    name: "Book of Ra Deluxe",
    provider: "Novomatic",
    defaultSel: 10,
    rtp: 95.0,
  },
  {
    alias: "netent/tikiwonders",
    name: "Tiki Wonders",
    provider: "NetEnt",
    defaultSel: 30,
    rtp: 96.0,
  },
  {
    alias: "agt/suncity",
    name: "Sun City",
    provider: "AGT",
    defaultSel: 30,
    rtp: 95.5,
  },
];

module.exports = {
  CATALOG,
  health,
  newGame,
  spin,
  ensureWallet,
};
