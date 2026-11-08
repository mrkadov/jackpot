// Slotopol sembol ID → görsel (oyun bazlı). Resmi asset yok; temalı tile setleri.
window.SlotopolSymbols = (() => {
  const pack = (items) => {
    const map = {};
    items.forEach((it, i) => {
      map[i + 1] = it;
    });
    return map;
  };

  const THEMES = {
    "novomatic/jokerdolphin": {
      skin: "ocean",
      symbols: pack([
        { g: "🐬", n: "YUNUS", c: "wild" },
        { g: "🐡", n: "VATOZ", c: "hi" },
        { g: "🦀", n: "YENGEÇ", c: "hi" },
        { g: "🦄", n: "DENİZATI", c: "mid" },
        { g: "🐠", n: "ASLANB.", c: "mid" },
        { g: "🐟", n: "MELEK", c: "mid" },
        { g: "A", n: "AS", c: "low" },
        { g: "K", n: "PAPAZ", c: "low" },
        { g: "Q", n: "KIZ", c: "low" },
        { g: "J", n: "VALE", c: "low" },
        { g: "10", n: "ON", c: "low" },
        { g: "9", n: "DOKUZ", c: "low" },
        { g: "🫧", n: "İNCİ", c: "scat" },
      ]),
    },
    "novomatic/bookofra": {
      skin: "egypt",
      symbols: pack([
        { g: "🧭", n: "KAŞİF", c: "hi" },
        { g: "🧟", n: "MUMYA", c: "hi" },
        { g: "🗿", n: "HEYKEL", c: "mid" },
        { g: "🪲", n: "BÖCEK", c: "mid" },
        { g: "A", n: "AS", c: "low" },
        { g: "K", n: "PAPAZ", c: "low" },
        { g: "Q", n: "KIZ", c: "low" },
        { g: "J", n: "VALE", c: "low" },
        { g: "10", n: "ON", c: "low" },
        { g: "📖", n: "KİTAP", c: "scat" },
      ]),
    },
    "novomatic/bookofradeluxe": {
      skin: "egypt",
      symbols: pack([
        { g: "🧭", n: "KAŞİF", c: "hi" },
        { g: "🧟", n: "MUMYA", c: "hi" },
        { g: "🗿", n: "HEYKEL", c: "mid" },
        { g: "🪲", n: "BÖCEK", c: "mid" },
        { g: "A", n: "AS", c: "low" },
        { g: "K", n: "PAPAZ", c: "low" },
        { g: "Q", n: "KIZ", c: "low" },
        { g: "J", n: "VALE", c: "low" },
        { g: "10", n: "ON", c: "low" },
        { g: "📕", n: "KİTAP", c: "scat" },
      ]),
    },
    "netent/tikiwonders": {
      skin: "tiki",
      symbols: pack([
        { g: "🌺", n: "WILD", c: "wild" },
        { g: "🗿", n: "TİKİ", c: "scat" },
        { g: "🐬", n: "YUNUS", c: "hi" },
        { g: "🦎", n: "İGUANA", c: "hi" },
        { g: "🐢", n: "KAPLUM.", c: "mid" },
        { g: "🦜", n: "PAPAĞAN", c: "mid" },
        { g: "A", n: "AS", c: "low" },
        { g: "K", n: "PAPAZ", c: "low" },
        { g: "Q", n: "KIZ", c: "low" },
      ]),
    },
    "agt/suncity": {
      skin: "city",
      symbols: pack([
        { g: "☀️", n: "WILD", c: "wild" },
        { g: "💎", n: "SCAT", c: "scat" },
        { g: "🛥️", n: "YAT", c: "hi" },
        { g: "🏍️", n: "MOTOR", c: "hi" },
        { g: "👗", n: "BAYAN", c: "mid" },
        { g: "🛍️", n: "SATIŞ", c: "mid" },
        { g: "📦", n: "KURYE", c: "mid" },
        { g: "A", n: "AS", c: "low" },
        { g: "K", n: "PAPAZ", c: "low" },
      ]),
    },
  };

  const FALLBACK = pack([
    { g: "★", n: "WILD", c: "wild" },
    { g: "◆", n: "SCAT", c: "scat" },
    { g: "①", n: "S3", c: "hi" },
    { g: "②", n: "S4", c: "hi" },
    { g: "③", n: "S5", c: "mid" },
    { g: "④", n: "S6", c: "mid" },
    { g: "A", n: "AS", c: "low" },
    { g: "K", n: "PAPAZ", c: "low" },
    { g: "Q", n: "KIZ", c: "low" },
    { g: "J", n: "VALE", c: "low" },
    { g: "10", n: "ON", c: "low" },
    { g: "9", n: "9", c: "low" },
    { g: "✦", n: "BONUS", c: "scat" },
  ]);

  function resolve(alias) {
    const key = String(alias || "").toLowerCase();
    return THEMES[key] || { skin: "default", symbols: FALLBACK };
  }

  function get(alias, id) {
    const theme = resolve(alias);
    const sym = theme.symbols[id] || FALLBACK[id] || { g: String(id), n: `#${id}`, c: "low" };
    return { ...sym, skin: theme.skin };
  }

  function randomId(alias) {
    const theme = resolve(alias);
    const ids = Object.keys(theme.symbols);
    return Number(ids[Math.floor(Math.random() * ids.length)] || 1);
  }

  return { resolve, get, randomId, THEMES };
})();
