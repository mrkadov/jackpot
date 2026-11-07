(async function () {
  try {
    const res = await fetch("/api/public/trust");
    const data = await res.json();
    const host = document.getElementById("trustBar");
    if (!host) return;
    host.innerHTML = `
      <div class="trust-item">🛡️ ${data.license.name}</div>
      <div class="trust-item">🔐 SSL / Veri Şifreleme</div>
      <div class="trust-item">⚡ ${data.infrastructure}</div>
      <div class="trust-item">🎮 ${data.providers.slice(0, 3).join(" · ")}</div>
    `;
  } catch (_) {
    /* ignore */
  }
})();
