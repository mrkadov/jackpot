(async function () {
  const { api, getToken, clearAuth, getCachedUser, money, setAuth } = window.JackpotAPI;
  const actions = document.querySelector(".nav-actions");
  if (!actions) return;

  function renderGuest() {
    actions.innerHTML = `
      <a class="btn" href="signup.html">Kayıt Ol</a>
      <a class="btn btn-ghost" href="login.html">Giriş</a>
    `;
  }

  function renderUser(user) {
    const bal = user.wallet ? money(user.wallet.balance) : "0,00 ₺";
    actions.innerHTML = `
      <a class="btn btn-ghost" href="hesabim.html">${user.name} · ${bal}</a>
      <a class="btn" href="kasa.html">Kasa</a>
      <button type="button" class="btn btn-ghost" id="logoutBtn">Çıkış</button>
    `;
    const btn = document.getElementById("logoutBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        clearAuth();
        window.location.href = "index.html";
      });
    }
  }

  if (!getToken()) {
    renderGuest();
    return;
  }

  try {
    const { user } = await api("/auth/me");
    setAuth(getToken(), user);
    renderUser(user);
  } catch {
    clearAuth();
    renderGuest();
  }

  // silence unused
  void getCachedUser;
})();
