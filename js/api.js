(function (global) {
  const API_BASE = "/api";
  const TOKEN_KEY = "jackpot_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setAuth(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem("jackpot_user", JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("jackpot_user");
  }

  function getCachedUser() {
    try {
      return JSON.parse(localStorage.getItem("jackpot_user") || "null");
    } catch {
      return null;
    }
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "İstek başarısız");
    return data;
  }

  function money(n) {
    return (
      Number(n || 0).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " ₺"
    );
  }

  function requireAuthPage() {
    if (!getToken()) {
      window.location.href = "login.html";
      return false;
    }
    return true;
  }

  global.JackpotAPI = {
    api,
    getToken,
    setAuth,
    clearAuth,
    getCachedUser,
    money,
    requireAuthPage,
  };
})(window);
