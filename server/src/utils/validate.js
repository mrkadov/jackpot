function validateTCKN(value) {
  const tc = String(value || "").trim();
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((odd * 7 - even) % 10 !== d[9]) return false;
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum10 % 10 === d[10];
}

function validatePhoneTR(value) {
  const p = String(value || "").replace(/\s+/g, "");
  return /^(?:\+90|0)?5\d{9}$/.test(p);
}

function normalizePhone(value) {
  let p = String(value || "").replace(/\D/g, "");
  if (p.startsWith("90") && p.length === 12) p = p.slice(2);
  if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  return p;
}

function isAdult(birthDateStr, minAge = 18) {
  const d = new Date(birthDateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= minAge;
}

module.exports = { validateTCKN, validatePhoneTR, normalizePhone, isAdult };
