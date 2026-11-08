(() => {
  const TOKEN_KEY = "jackpot_token";
  const BETS = [1, 2, 5, 10];
  const ICONS = ["❓", "🍒", "🍋", "🍊", "🍇", "🔔", "⭐", "7️⃣", "💎", "🃏", "🐬", "📜", "👑", "🔥", "🍀", "🧿", "🌙", "⚡", "🪙", "🦋"];

  const params = new URLSearchParams(location.search);
  const alias = (params.get("alias") || "novomatic/jokerdolphin").toLowerCase();
  const fromQuery = params.get("token");
  if (fromQuery) {
    try {
      localStorage.setItem(TOKEN_KEY, fromQuery);
      params.delete("token");
      history.replaceState({}, "", `${location.pathname}?${params}${location.hash || ""}`);
    } catch (_) {}
  }

  const els = {
    title: document.getElementById("title"),
    subtitle: document.getElementById("subtitle"),
    reels: document.getElementById("reels"),
    balance: document.getElementById("balance"),
    betLabel: document.getElementById("betLabel"),
    selLabel: document.getElementById("selLabel"),
    costLabel: document.getElementById("costLabel"),
    lastWin: document.getElementById("lastWin"),
    freeSpins: document.getElementById("freeSpins"),
    msg: document.getElementById("msg"),
    spin: document.getElementById("spin"),
    betUp: document.getElementById("betUp"),
    betDown: document.getElementById("betDown"),
    winFlash: document.getElementById("winFlash"),
  };

  const state = {
    alias,
    betIndex: 0,
    sel: 9,
    balance: 0,
    freeSpins: 0,
    rows: 3,
    cols: 5,
  };
  let spinning = false;

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(path, { ...options, headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "İstek başarısız");
    return data;
  }

  function icon(id) {
    return ICONS[id] || ICONS[id % ICONS.length] || "•";
  }

  function money(n) {
    return Number(n || 0).toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function ui() {
    const bet = BETS[state.betIndex];
    els.balance.textContent = money(state.balance);
    els.betLabel.textContent = bet;
    els.selLabel.textContent = state.sel;
    els.costLabel.textContent = money(bet * state.sel);
    els.freeSpins.textContent = state.freeSpins;
    const can =
      !spinning && token() && (state.freeSpins > 0 || state.balance >= bet * state.sel);
    els.spin.disabled = !can;
    els.betUp.disabled = spinning;
    els.betDown.disabled = spinning;
  }

  function setMsg(text, type = "") {
    els.msg.textContent = text;
    els.msg.className = "msg " + type;
  }

  function buildReels(cols = 5, rows = 3) {
    state.cols = cols;
    state.rows = rows;
    els.reels.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    els.reels.innerHTML = "";
    for (let c = 0; c < cols; c++) {
      const reel = document.createElement("div");
      reel.className = "reel";
      const win = document.createElement("div");
      win.className = "reel-window";
      for (let r = 0; r < rows; r++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = ICONS[1 + ((c + r) % 8)];
        win.appendChild(cell);
      }
      reel.appendChild(win);
      els.reels.appendChild(reel);
    }
  }

  function applyGrid(grid) {
    if (!Array.isArray(grid) || !grid.length) return;
    const cols = grid.length;
    const rows = grid[0]?.length || 3;
    if (cols !== state.cols || rows !== state.rows) buildReels(cols, rows);
    for (let c = 0; c < cols; c++) {
      const cells = els.reels.children[c]?.querySelectorAll(".cell");
      if (!cells) continue;
      for (let r = 0; r < rows; r++) {
        if (cells[r]) cells[r].textContent = icon(grid[c][r]);
      }
    }
  }

  function clearWins() {
    document.querySelectorAll(".cell.win").forEach((c) => c.classList.remove("win"));
  }

  function markWins(wins) {
    (wins || []).forEach((w) => {
      (w.xy || []).forEach((pair) => {
        const col = Array.isArray(pair) ? pair[0] - 1 : null;
        const row = Array.isArray(pair) ? pair[1] - 1 : null;
        if (col == null || row == null) return;
        const cell = els.reels.children[col]?.querySelectorAll(".cell")[row];
        if (cell) cell.classList.add("win");
      });
    });
  }

  async function animate(grid) {
    const reels = [...els.reels.children];
    reels.forEach((r) => r.classList.add("spinning"));
    await Promise.all(
      reels.map(
        (reel, i) =>
          new Promise((resolve) => {
            const cells = reel.querySelectorAll(".cell");
            let ticks = 8 + i * 2;
            const timer = setInterval(() => {
              cells.forEach((c) => {
                c.textContent = ICONS[1 + Math.floor(Math.random() * 12)];
              });
              ticks -= 1;
              if (ticks <= 0) {
                clearInterval(timer);
                cells.forEach((c, row) => {
                  c.textContent = icon(grid?.[i]?.[row] || 1);
                });
                reel.classList.remove("spinning");
                resolve();
              }
            }, 45);
          })
      )
    );
  }

  function notifyParent(balance) {
    try {
      window.parent?.postMessage({ type: "jackpot-balance", balance }, window.location.origin);
    } catch (_) {}
  }

  async function spin() {
    if (spinning) return;
    if (!token()) {
      setMsg("Önce siteye giriş yapın", "lose");
      return;
    }
    const bet = BETS[state.betIndex];
    if (state.freeSpins <= 0 && state.balance < bet * state.sel) {
      setMsg("Yetersiz bakiye", "lose");
      return;
    }

    spinning = true;
    clearWins();
    ui();
    setMsg(state.freeSpins > 0 ? "Free Spin..." : "Makaralar dönüyor...");

    try {
      const result = await api("/api/slotopol/spin", {
        method: "POST",
        body: JSON.stringify({ alias: state.alias, bet, sel: state.sel }),
      });
      await animate(result.grid);
      applyGrid(result.grid);
      markWins(result.wins);
      state.balance = result.balance;
      state.sel = result.sel || state.sel;
      state.freeSpins = result.freeSpins || 0;
      els.lastWin.textContent = money(result.win || 0);
      notifyParent(result.balance);

      if (result.win > 0) {
        els.winFlash.classList.add("show");
        setTimeout(() => els.winFlash.classList.remove("show"), 450);
        setMsg(`Kazanç: ${money(result.win)} ₺ · Bakiye ${money(result.balance)}`, "win");
      } else {
        setMsg(`Bahis ${money(result.cost)} · Bakiye ${money(result.balance)}`, "lose");
      }
    } catch (ex) {
      setMsg(ex.message || "Spin hatası", "lose");
    }

    spinning = false;
    ui();
  }

  async function boot() {
    buildReels();
    ui();
    if (!token()) {
      setMsg("Gerçek bakiye için giriş yapıp lobiden açın", "lose");
      els.spin.disabled = true;
      return;
    }
    try {
      const data = await api("/api/slotopol/session", {
        method: "POST",
        body: JSON.stringify({ alias: state.alias, bet: BETS[state.betIndex] }),
      });
      els.title.textContent = (data.name || "SLOT").toUpperCase();
      els.subtitle.textContent = `${data.provider || "Slotopol"} · ${data.alias}`;
      state.sel = data.sel;
      state.balance = data.balance;
      state.freeSpins = data.freeSpins || 0;
      applyGrid(data.grid);
      ui();
      setMsg(`Hazır · çevirim maliyeti ${money(data.cost)} ₺`);
    } catch (ex) {
      setMsg(ex.message || "Bağlantı hatası", "lose");
      els.spin.disabled = true;
    }
  }

  els.spin.addEventListener("click", spin);
  els.betUp.addEventListener("click", () => {
    if (state.betIndex < BETS.length - 1) state.betIndex += 1;
    ui();
  });
  els.betDown.addEventListener("click", () => {
    if (state.betIndex > 0) state.betIndex -= 1;
    ui();
  });

  boot();
})();
