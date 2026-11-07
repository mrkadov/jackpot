function personalize(template, user = {}) {
  const first = user.firstName || (user.name || "").split(" ")[0] || "Değerli Üyemiz";
  const last = user.lastName || (user.name || "").split(" ").slice(1).join(" ") || "";
  const full = user.name || `${first} ${last}`.trim();
  const username = (user.email || "oyuncu").split("@")[0];
  return String(template || "")
    .replace(/\{\{\s*ad\s*\}\}/gi, first)
    .replace(/\{\{\s*soyad\s*\}\}/gi, last)
    .replace(/\{\{\s*isim\s*\}\}/gi, full)
    .replace(/\{\{\s*kullanici\s*\}\}/gi, username)
    .replace(/\{\{\s*email\s*\}\}/gi, user.email || "");
}

const SUPPORT_CATEGORIES = [
  { code: "YATIRIM", label: "Yatırım İşlemleri" },
  { code: "CEKIM", label: "Çekim İşlemleri" },
  { code: "BONUS", label: "Bonus / Promosyon" },
  { code: "HESAP", label: "Hesap / Giriş" },
  { code: "OYUN", label: "Oyun Sorunları" },
  { code: "KYC", label: "KYC / Doğrulama" },
  { code: "GENEL", label: "Genel Destek" },
];

module.exports = { personalize, SUPPORT_CATEGORIES };
