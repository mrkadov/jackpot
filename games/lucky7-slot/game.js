(() => {
  const SYMBOLS = [
    { id: "seven", icon: "7️⃣" },
    { id: "bell", icon: "🔔" },
    { id: "cherry", icon: "🍒" },
    { id: "lemon", icon: "🍋" },
    { id: "grape", icon: "🍇" },
    { id: "wild", icon: "⭐" },
    { id: "scatter", icon: "💎" },
  ];
  const ICON = Object.fromEntries(SYMBOLS.map((s) => [s.id, s.icon]));
  const BETS = [1, 2, 5, 10, 25, 50];
  const TOKEN_KEY = "jackpot_token";

  const els = {
    reels: document.getElementById("reels"),
    balance: document.getElementById("balance"),
    betLabel: document.getElementById("betLabel"),
    lastWin: document.getElementById("lastWin"),
    freeSpins: document.getElementById("freeSpins"),
    jackpot: document.getElementById("jackpot"),
    msg: document.getElementById("msg"),
    spin: document.getElementById("spin"),
    betUp: document.getElementById("betUp"),
    betDown: document.getElementById("betDown"),
    auto: document.getElementById("auto"),
    winFlash: document.getElementById("winFlash"),
  };

  let state = {
    balance: 0,
    betIndex: 2,
    jackpot: 2500,
    freeSpins: 0,
    live: false,
  };
  let spinning = false;
  let auto = false;

  function token() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("token");
    if (fromQuery) {
      try {
        localStorage.setItem(TOKEN_KEY, fromQuery);
      } catch (_) {}
      // strip token from URL after capture
      params.delete("token");
      const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || ""}`;
      try {
        window.history.replaceState({}, "", clean);
      } catch (_) {}
      return fromQuery;
    }
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

  function notifyParent(balance) {
    const payload = { type: "jackpot-balance", balance };
    try {
      window.parent?.postMessage(payload, window.location.origin);
    } catch (_) {
      try {
        window.parent?.postMessage(payload, "*");
      } catch (__) {}
    }
  }

  function ui() {
    els.balance.textContent = Number(state.balance).toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    els.betLabel.textContent = BETS[state.betIndex];
    els.freeSpins.textContent = state.freeSpins;
    els.jackpot.textContent = Math.floor(state.jackpot).toLocaleString("tr-TR");
    const canSpin =
      !spinning && (state.freeSpins > 0 || state.balance >= BETS[state.betIndex]);
    els.spin.disabled = !canSpin;
    els.betUp.disabled = spinning || auto;
    els.betDown.disabled = spinning || auto;
    els.auto.classList.toggle("on", auto);
  }

  function setMsg(text, type = "") {
    els.msg.textContent = text;
    els.msg.className = "msg " + type;
  }

  function beep(freq = 440, dur = 0.08, type = "square", vol = 0.03) {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch (_) {}
  }

  function buildReels() {
    els.reels.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const reel = document.createElement("div");
      reel.className = "reel";
      const win = document.createElement("div");
      win.className = "reel-window";
      for (let r = 0; r < 3; r++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].icon;
        win.appendChild(cell);
      }
      reel.appendChild(win);
      els.reels.appendChild(reel);
    }
  }

  function clearWins() {
    document.querySelectorAll(".cell.win").forEach((c) => c.classList.remove("win"));
  }

  function applyBoard(board) {
    for (let r = 0; r < 5; r++) {
      const cells = els.reels.children[r].querySelectorAll(".cell");
      cells.forEach((cell, row) => {
        cell.textContent = board[r][row].icon || ICON[board[r][row].id] || "❓";
      });
    }
  }

  function markWins(winCells) {
    (winCells || []).forEach((key) => {
      const [reel, row] = key.split(":").map(Number);
      const cell = els.reels.children[reel]?.querySelectorAll(".cell")[row];
      if (cell) cell.classList.add("win");
    });
  }

  async function animateToBoard(finalBoard) {
    const reels = [...els.reels.children];
    reels.forEach((r) => r.classList.add("spinning"));

    await Promise.all(
      reels.map(
        (reel, i) =>
          new Promise((resolve) => {
            const cells = reel.querySelectorAll(".cell");
            let ticks = 10 + i * 3;
            const timer = setInterval(() => {
              cells.forEach((c) => {
                c.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].icon;
              });
              beep(180 + i * 40, 0.03, "triangle", 0.015);
              ticks -= 1;
              if (ticks <= 0) {
                clearInterval(timer);
                cells.forEach((c, row) => {
                  c.textContent =
                    finalBoard[i][row].icon || ICON[finalBoard[i][row].id] || "❓";
                });
                reel.classList.remove("spinning");
                beep(520 + i * 30, 0.05, "sine", 0.025);
                resolve();
              }
            }, 55);
          })
      )
    );
  }

  async function spin() {
    if (spinning) return;
    if (!token()) {
      setMsg("Bakiye için önce siteye giriş yapın", "lose");
      return;
    }

    const bet = BETS[state.betIndex];
    if (state.freeSpins <= 0 && state.balance < bet) {
      setMsg("Yetersiz bakiye — Kasa’dan yatırım yapın", "lose");
      auto = false;
      ui();
      return;
    }

    spinning = true;
    clearWins();
    ui();
    setMsg(state.freeSpins > 0 ? "Free Spin..." : "Makaralar dönüyor...");

    try {
      const result = await api("/api/games/lucky7/spin", {
        method: "POST",
        body: JSON.stringify({ bet }),
      });

      // optimistic display during animation uses returned board
      await animateToBoard(result.board);
      applyBoard(result.board);
      markWins(result.winCells);

      state.balance = result.balance;
      state.freeSpins = result.freeSpins;
      state.jackpot = result.jackpot;
      els.lastWin.textContent = Number(result.win || 0).toLocaleString("tr-TR");

      if (result.win > 0) {
        els.winFlash.classList.add("show");
        setTimeout(() => els.winFlash.classList.remove("show"), 500);
        beep(660, 0.1, "sawtooth", 0.035);
        beep(880, 0.12, "sine", 0.04);
        let text = `Kazanç: ${result.win} ₺ (bakiye: ${result.balance})`;
        if (result.jackpotHit) text = `JACKPOT! +${result.win} ₺`;
        if (result.freeAward) text += ` · +${result.freeAward} Free Spin`;
        setMsg(text, "win");
      } else if (result.freeAward) {
        setMsg(`Scatter! +${result.freeAward} Free Spin`, "win");
      } else {
        setMsg(`Bahis düşüldü · Bakiye: ${result.balance}`, "lose");
      }

      notifyParent(result.balance);
    } catch (ex) {
      setMsg(ex.message || "Spin hatası", "lose");
      auto = false;
      // resync wallet after failed spin
      try {
        const data = await api("/api/games/lucky7/state");
        state.balance = data.balance;
        state.freeSpins = data.freeSpins;
        state.jackpot = data.jackpot;
        notifyParent(data.balance);
      } catch (_) {}
    }

    spinning = false;
    ui();

    if (auto) {
      setTimeout(() => {
        if (auto) spin();
      }, 750);
    }
  }

  async function boot() {
    buildReels();
    ui();

    if (!token()) {
      setMsg("Gerçek bakiye için giriş yapıp oyunu lobiden açın", "lose");
      els.spin.disabled = true;
      return;
    }

    try {
      const data = await api("/api/games/lucky7/state");
      state.live = true;
      state.balance = data.balance;
      state.freeSpins = data.freeSpins;
      state.jackpot = data.jackpot;
      ui();
      setMsg(`Canlı cüzdan bağlı · Bakiye ${data.balance} ₺`);
    } catch (ex) {
      setMsg(ex.message || "Cüzdan bağlanamadı", "lose");
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
  els.auto.addEventListener("click", () => {
    auto = !auto;
    ui();
    if (auto && !spinning) spin();
  });

  boot();
})();
