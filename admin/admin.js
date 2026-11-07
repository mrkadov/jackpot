const API = "/api";
const tokenKey = "jackpot_token";

function token() {
  return localStorage.getItem(tokenKey);
}
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "İstek başarısız");
  return data;
}
function money(n) {
  return Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}
function showApp(show) {
  document.getElementById("loginGate").classList.toggle("hidden", show);
  document.getElementById("app").classList.toggle("hidden", !show);
}

document.getElementById("adminLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("loginError");
  err.textContent = "";
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value,
      }),
    });
    if (data.user.role !== "ADMIN") throw new Error("Bu hesap yönetici değil");
    localStorage.setItem(tokenKey, data.token);
    showApp(true);
    await refreshAll();
  } catch (ex) {
    err.textContent = ex.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem(tokenKey);
  showApp(false);
});

document.querySelectorAll(".sidebar nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

async function loadDashboard() {
  const { stats, series } = await api("/admin/dashboard");
  document.getElementById("stats").innerHTML = `
    <div class="stat"><span>Oyuncu</span><strong>${stats.users}</strong></div>
    <div class="stat"><span>~Aktif Oturum (24s)</span><strong>${stats.onlineApprox}</strong></div>
    <div class="stat"><span>Bekleyen Ödeme</span><strong>${stats.pendingPayments}</strong></div>
    <div class="stat"><span>KYC Bekleyen</span><strong>${stats.pendingKyc}</strong></div>
    <div class="stat"><span>Risk Alarm</span><strong>${stats.openAlerts}</strong></div>
    <div class="stat"><span>Açık Destek</span><strong>${stats.openTickets}</strong></div>
    <div class="stat"><span>GGR 30g</span><strong>${money(stats.ggr30d)}</strong></div>
    <div class="stat"><span>NGR 30g</span><strong>${money(stats.ngr30d)}</strong></div>
    <div class="stat"><span>Toplam Bakiye</span><strong>${money(stats.totalBalance)}</strong></div>
  `;
  const max = Math.max(1, ...series.map((s) => Math.abs(s.ggr)));
  document.getElementById("ggrChart").innerHTML = series
    .map(
      (s) => `<div class="bar-col" title="${s.date}: ${money(s.ggr)}">
        <div class="bar" style="height:${Math.max(8, (Math.abs(s.ggr) / max) * 120)}px"></div>
        <small>${s.date.slice(5)}</small>
      </div>`
    )
    .join("");
}

async function openPlayer(id) {
  const data = await api(`/admin/users/${id}`);
  const u = data.user;
  const el = document.getElementById("playerDetail");
  el.classList.remove("hidden");
  document.querySelector('[data-tab="dashboard"]').click();
  el.innerHTML = `
    <h3>360° Oyuncu: ${u.name}</h3>
    <p>${u.email} · ${u.phone || "-"} · VIP ${u.vipLevel} · KYC ${u.kycStatus} · Risk ${u.riskScore}</p>
    <p>TC ${u.tcKimlik || "-"} · ${u.city}/${u.district} · IP ${u.lastIp || "-"}</p>
    <p>Bakiye ${money(data.wallet?.balance)} · Bonus ${money(data.wallet?.bonusBalance)} · Çekilebilir ${money(data.wallet?.withdrawable)}</p>
    <div class="actions" style="margin:0.75rem 0">
      <select id="vipSet">${["BRONZE","SILVER","GOLD","PLATINUM","DIAMOND"].map((v)=>`<option ${v===u.vipLevel?"selected":""}>${v}</option>`).join("")}</select>
      <input id="depLimit" type="number" placeholder="Günlük yat. limit" value="${u.depositLimitDaily ?? ""}" />
      <button id="savePlayer">Kaydet</button>
      <button id="freezePlayer">Hesabı Dondur</button>
    </div>
    <h4>Son Oyunlar</h4>
    <ul>${data.sessions.slice(0,8).map((s)=>`<li>${s.game?.name || "-"} (${s.game?.provider?.name || ""}) · ${new Date(s.startedAt).toLocaleString("tr-TR")}</li>`).join("") || "<li>Yok</li>"}</ul>
    <h4>Bonuslar</h4>
    <ul>${data.bonuses.slice(0,8).map((b)=>`<li>${b.name}: ${money(b.amount)} · çevrim ${b.wagerProgress}/${b.wagerRequired} · ${b.status}</li>`).join("") || "<li>Yok</li>"}</ul>
    <h4>Ödemeler</h4>
    <ul>${data.payments.slice(0,8).map((p)=>`<li>${p.type} ${money(p.amount)} · ${p.status} · risk ${p.riskScore}</li>`).join("") || "<li>Yok</li>"}</ul>
  `;
  document.getElementById("savePlayer").onclick = async () => {
    await api(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        vipLevel: document.getElementById("vipSet").value,
        depositLimitDaily: Number(document.getElementById("depLimit").value) || null,
      }),
    });
    alert("Oyuncu güncellendi");
    await openPlayer(id);
  };
  document.getElementById("freezePlayer").onclick = async () => {
    if (!confirm("Hesap dondurulsun mu?")) return;
    await api(`/admin/risk/freeze/${id}`, { method: "POST" });
    alert("Donduruldu");
  };
}

async function loadUsers() {
  const { users } = await api("/admin/users");
  document.getElementById("usersTable").innerHTML = `
    <thead><tr><th>Oyuncu</th><th>TC / VIP / KYC</th><th>Adres</th><th>ID</th><th>Bakiye</th><th></th></tr></thead>
    <tbody>${users
      .map(
        (u) => `<tr>
      <td>${u.name}<br><small>${u.email}<br>${u.phone || ""}</small></td>
      <td>${u.tcKimlik || "-"}<br><small>VIP ${u.vipLevel} · KYC ${u.kycStatus}</small></td>
      <td>${u.city || "-"} / ${u.district || "-"}</td>
      <td><code>${u.id}</code></td>
      <td>${money(u.wallet?.balance)}</td>
      <td><button data-open="${u.id}">360°</button></td>
    </tr>`
      )
      .join("")}</tbody>`;
  document.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openPlayer(b.dataset.open))
  );
}

document.getElementById("adjustForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/admin/wallet/adjust", {
      method: "POST",
      body: JSON.stringify({
        userId: document.getElementById("adjustUserId").value.trim(),
        amount: Number(document.getElementById("adjustAmount").value),
        note: document.getElementById("adjustNote").value,
      }),
    });
    e.target.reset();
    await loadUsers();
    await loadDashboard();
    alert("Bakiye güncellendi");
  } catch (ex) {
    alert(ex.message);
  }
});

let payFilter = "PENDING";
document.querySelectorAll("[data-pay-filter]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("[data-pay-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    payFilter = btn.dataset.payFilter;
    await loadPayments();
  });
});

async function loadPayments() {
  const q = payFilter ? `?status=${payFilter}` : "";
  const { payments } = await api(`/admin/payments${q}`);
  document.getElementById("paymentsTable").innerHTML = `
    <thead><tr><th>Tip</th><th>Oyuncu</th><th>Tutar</th><th>Yöntem</th><th>Risk</th><th>Durum</th><th></th></tr></thead>
    <tbody>${
      payments
        .map(
          (p) => `<tr>
      <td>${p.type === "DEPOSIT" ? "Yatırım" : "Çekim"}${p.autoReview ? " (oto)" : ""}</td>
      <td>${p.user?.name}<br><small>${p.user?.email}<br>VIP ${p.user?.vipLevel} · KYC ${p.user?.kycStatus}</small></td>
      <td>${money(p.amount)}</td>
      <td>${p.method}</td>
      <td><span class="badge ${p.riskScore >= 50 ? "REJECTED" : "PENDING"}">${p.riskScore}</span></td>
      <td><span class="badge ${p.status}">${p.status}</span></td>
      <td class="actions">${
        p.status === "PENDING"
          ? `<button data-approve="${p.id}">Onayla</button><button data-reject="${p.id}">Reddet</button>`
          : "-"
      }</td>
    </tr>`
        )
        .join("") || "<tr><td colspan='7'>Kayıt yok</td></tr>"
    }</tbody>`;
  document.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/admin/payments/${btn.dataset.approve}/approve`, { method: "POST" });
      await refreshFinance();
    })
  );
  document.querySelectorAll("[data-reject]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/admin/payments/${btn.dataset.reject}/reject`, { method: "POST" });
      await refreshFinance();
    })
  );
}

async function loadKyc() {
  const { docs } = await api("/admin/kyc");
  document.getElementById("kycTable").innerHTML = `
    <thead><tr><th>Oyuncu</th><th>Belge</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
    <tbody>${
      docs
        .map(
          (d) => `<tr>
      <td>${d.user?.name}<br><small>${d.user?.email}</small></td>
      <td>${d.docType}<br><small>${d.fileName}</small>
        ${d.fileData?.startsWith("data:image") ? `<br><img src="${d.fileData}" style="max-width:120px;border-radius:8px;margin-top:6px"/>` : ""}
      </td>
      <td><span class="badge ${d.status}">${d.status}</span></td>
      <td>${new Date(d.createdAt).toLocaleString("tr-TR")}</td>
      <td class="actions">${
        d.status === "PENDING"
          ? `<button data-kyc-ok="${d.id}">Onayla</button><button data-kyc-no="${d.id}">Reddet</button>`
          : "-"
      }</td>
    </tr>`
        )
        .join("") || "<tr><td colspan='5'>Belge yok</td></tr>"
    }</tbody>`;
  document.querySelectorAll("[data-kyc-ok]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/admin/kyc/${b.dataset.kycOk}/review`, {
        method: "POST",
        body: JSON.stringify({ status: "APPROVED" }),
      });
      await loadKyc();
      await loadDashboard();
    })
  );
  document.querySelectorAll("[data-kyc-no]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/admin/kyc/${b.dataset.kycNo}/review`, {
        method: "POST",
        body: JSON.stringify({ status: "REJECTED", reviewNote: "Belge yetersiz" }),
      });
      await loadKyc();
    })
  );
}

async function loadGames() {
  const [{ providers }, { games }] = await Promise.all([
    api("/admin/providers"),
    api("/admin/games"),
  ]);
  document.getElementById("gameProvider").innerHTML = providers
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join("");
  document.getElementById("gamesTable").innerHTML = `
    <thead><tr><th>Oyun</th><th>Sağlayıcı</th><th>Kategori</th><th>RTP</th><th>Etiket</th><th>Durum</th><th></th></tr></thead>
    <tbody>${games
      .map(
        (g) => `<tr>
      <td>${g.name}</td>
      <td>${g.provider?.name || "-"}</td>
      <td>${g.category}</td>
      <td>${g.rtp}%</td>
      <td>${g.popular ? "Popüler " : ""}${g.featured ? "Öne çıkan" : ""}</td>
      <td>${g.active ? "Aktif" : "Pasif"}</td>
      <td class="actions">
        <button data-toggle-game="${g.id}" data-active="${g.active ? "0" : "1"}">${g.active ? "Pasifleştir" : "Aktifleştir"}</button>
        <button data-del="${g.id}">Sil</button>
      </td>
    </tr>`
      )
      .join("")}</tbody>`;
  document.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Silinsin mi?")) return;
      await api(`/admin/games/${btn.dataset.del}`, { method: "DELETE" });
      await loadGames();
    })
  );
  document.querySelectorAll("[data-toggle-game]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/admin/games/${btn.dataset.toggleGame}`, {
        method: "PUT",
        body: JSON.stringify({ active: btn.dataset.active === "1" }),
      });
      await loadGames();
    })
  );
}

document.getElementById("providerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/admin/providers", {
    method: "POST",
    body: JSON.stringify({ name: document.getElementById("providerName").value }),
  });
  e.target.reset();
  await loadGames();
});

document.getElementById("gameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/admin/games", {
    method: "POST",
    body: JSON.stringify({
      providerId: document.getElementById("gameProvider").value,
      name: document.getElementById("gameName").value,
      category: document.getElementById("gameCategory").value,
      launchUrl: document.getElementById("gameUrl").value,
      rtp: Number(document.getElementById("gameRtp").value || 96),
      popular: document.getElementById("gamePopular").checked,
      featured: document.getElementById("gameFeatured").checked,
    }),
  });
  await loadGames();
  alert("Oyun eklendi");
});

async function loadBonuses() {
  const { templates } = await api("/admin/bonuses/templates");
  document.getElementById("bonusTplTable").innerHTML = `
    <thead><tr><th>Ad</th><th>Tip</th><th>Tutar/%</th><th>Çevrim</th><th>Trigger</th><th>Aktif</th></tr></thead>
    <tbody>${templates
      .map(
        (t) => `<tr>
      <td>${t.name}</td><td>${t.type}</td><td>${t.amount} / %${t.percent}</td>
      <td>x${t.wagerMultiplier}</td><td>${t.autoTrigger || "-"}</td><td>${t.active ? "Evet" : "Hayır"}</td>
    </tr>`
      )
      .join("")}</tbody>`;
}

document.getElementById("bonusTplForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/admin/bonuses/templates", {
    method: "POST",
    body: JSON.stringify({
      name: document.getElementById("btName").value,
      type: document.getElementById("btType").value,
      amount: Number(document.getElementById("btAmount").value),
      wagerMultiplier: Number(document.getElementById("btWager").value),
      autoTrigger: document.getElementById("btTrigger").value || null,
    }),
  });
  e.target.reset();
  await loadBonuses();
});

document.getElementById("bonusGrantForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/admin/bonuses/grant", {
    method: "POST",
    body: JSON.stringify({
      userId: document.getElementById("bgUserId").value.trim(),
      amount: Number(document.getElementById("bgAmount").value),
      name: document.getElementById("bgName").value,
      type: "MANUAL",
    }),
  });
  alert("Bonus tanımlandı");
});

async function loadRisk() {
  const { alerts } = await api("/admin/risk/alerts");
  document.getElementById("riskTable").innerHTML = `
    <thead><tr><th>Seviye</th><th>Tip</th><th>Mesaj</th><th>Oyuncu</th><th>Durum</th><th></th></tr></thead>
    <tbody>${alerts
      .map(
        (a) => `<tr>
      <td>${a.severity}</td><td>${a.type}</td><td>${a.message}</td>
      <td>${a.user?.email || "-"}</td>
      <td>${a.resolved ? "Kapalı" : "Açık"}</td>
      <td>${a.resolved ? "-" : `<button data-resolve="${a.id}">Çöz</button>`}</td>
    </tr>`
      )
      .join("")}</tbody>`;
  document.querySelectorAll("[data-resolve]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/admin/risk/alerts/${b.dataset.resolve}/resolve`, { method: "POST" });
      await loadRisk();
      await loadDashboard();
    })
  );
}

async function loadAffiliates() {
  const { affiliates } = await api("/admin/affiliates");
  document.getElementById("affTable").innerHTML = `
    <thead><tr><th>Kod</th><th>Partner</th><th>Model</th><th>Oran</th><th>Kayıt</th><th>Kazanç</th></tr></thead>
    <tbody>${affiliates
      .map(
        (a) => `<tr>
      <td><code>${a.code}</code></td>
      <td>${a.user?.name}<br><small>${a.user?.email}</small></td>
      <td>${a.commissionType}</td><td>%${a.rate}</td><td>${a.signups}</td><td>${money(a.earnings)}</td>
    </tr>`
      )
      .join("") || "<tr><td colspan='6'>Affiliate yok</td></tr>"}</tbody>`;
}

document.getElementById("affForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/admin/affiliates", {
    method: "POST",
    body: JSON.stringify({
      userId: document.getElementById("affUserId").value.trim(),
      code: document.getElementById("affCode").value.trim() || undefined,
      rate: Number(document.getElementById("affRate").value || 25),
    }),
  });
  e.target.reset();
  await loadAffiliates();
});

let activeSupportId = null;
let supportPoll = null;

function stopSupportPoll() {
  if (supportPoll) clearInterval(supportPoll);
  supportPoll = null;
}

function renderThread(ticket, canned) {
  const box = document.getElementById("supportThread");
  box.classList.remove("hidden");
  const u = ticket.user || {};
  const catCanned = (canned || []).filter(
    (c) => c.category === ticket.category || c.category === "GENEL"
  );
  box.innerHTML = `
    <h3>${ticket.subject} <small style="color:var(--muted)">[${ticket.category}]</small></h3>
    <p style="color:var(--muted);margin-bottom:0.5rem">${u.name} · ${u.email} · VIP ${u.vipLevel || "-"}</p>
    <div class="thread" id="threadMsgs">${ticket.messages
      .map(
        (m) =>
          `<p><strong>${m.sender === "ADMIN" ? "Destek" : "Oyuncu"}:</strong> ${m.body}<br><small>${new Date(m.createdAt).toLocaleTimeString("tr-TR")}</small></p>`
      )
      .join("")}</div>
    <div class="canned-row" id="cannedBtns">
      ${catCanned
        .map(
          (c) =>
            `<button type="button" class="chip" data-canned="${c.id}" title="${c.body.replace(/"/g, "&quot;")}">${c.title}</button>`
        )
        .join("") || "<small style='color:var(--muted)'>Bu kategori için hazır cevap yok</small>"}
    </div>
    <form id="replyForm" class="card inline" style="margin-top:0.75rem">
      <textarea id="replyBody" rows="3" placeholder="Yanıt yazın veya hazır cevap seçin" required style="grid-column:1/-1"></textarea>
      <button type="submit">Gönder</button>
    </form>
    <p id="replyPreview" style="color:var(--muted);font-size:0.85rem"></p>`;

  document.querySelectorAll("[data-canned]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const { preview } = await api("/admin/canned-replies/preview", {
          method: "POST",
          body: JSON.stringify({ cannedId: btn.dataset.canned, userId: u.id }),
        });
        document.getElementById("replyBody").value = preview;
        document.getElementById("replyPreview").textContent =
          "Hazır cevap kişiselleştirildi: " + (u.firstName || u.name || "");
      } catch (ex) {
        alert(ex.message);
      }
    });
  });

  document.getElementById("replyForm").onsubmit = async (ev) => {
    ev.preventDefault();
    await api(`/admin/support/${ticket.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: document.getElementById("replyBody").value }),
    });
    document.getElementById("replyBody").value = "";
    const fresh = await api(`/admin/support/${ticket.id}`);
    renderThread(fresh.ticket, canned);
    await loadSupportListOnly();
  };
}

async function loadSupportListOnly() {
  const { tickets } = await api("/admin/support");
  document.getElementById("supportTable").innerHTML = `
    <thead><tr><th>Kategori</th><th>Konu</th><th>Oyuncu</th><th>VIP</th><th>Durum</th><th>Son</th><th></th></tr></thead>
    <tbody>${tickets
      .map(
        (t) => `<tr>
      <td>${t.category || "GENEL"}</td>
      <td>${t.subject}</td>
      <td>${t.user?.name}<br><small>${t.user?.email}</small></td>
      <td>${t.user?.vipLevel || "-"}${t.vipOnly ? " ★" : ""}</td>
      <td><span class="badge ${t.status === "OPEN" ? "PENDING" : "APPROVED"}">${t.status}</span></td>
      <td>${new Date(t.updatedAt).toLocaleTimeString("tr-TR")}</td>
      <td><button data-open-ticket="${t.id}">Aç</button></td>
    </tr>`
      )
      .join("")}</tbody>`;
  document.querySelectorAll("[data-open-ticket]").forEach((b) =>
    b.addEventListener("click", async () => {
      activeSupportId = b.dataset.openTicket;
      const { ticket } = await api(`/admin/support/${activeSupportId}`);
      const { replies: canned } = await api(
        `/admin/canned-replies?category=${encodeURIComponent(ticket.category || "GENEL")}`
      );
      renderThread(ticket, canned);
      stopSupportPoll();
      supportPoll = setInterval(async () => {
        try {
          const fresh = await api(`/admin/support/${activeSupportId}`);
          const thread = document.getElementById("threadMsgs");
          if (!thread) return;
          const html = fresh.ticket.messages
            .map(
              (m) =>
                `<p><strong>${m.sender === "ADMIN" ? "Destek" : "Oyuncu"}:</strong> ${m.body}<br><small>${new Date(m.createdAt).toLocaleTimeString("tr-TR")}</small></p>`
            )
            .join("");
          if (thread.innerHTML !== html) {
            thread.innerHTML = html;
            thread.scrollTop = thread.scrollHeight;
          }
        } catch (_) {}
      }, 2000);
    })
  );
}

async function loadCannedTable() {
  const { replies } = await api("/admin/canned-replies/all");
  document.getElementById("cannedTable").innerHTML = `
    <thead><tr><th>Başlık</th><th>Kategori</th><th>Metin</th><th></th></tr></thead>
    <tbody>${replies
      .map(
        (r) => `<tr>
      <td>${r.title}</td>
      <td>${r.category}</td>
      <td><small>${r.body}</small></td>
      <td><button data-del-canned="${r.id}">Sil</button></td>
    </tr>`
      )
      .join("")}</tbody>`;
  document.querySelectorAll("[data-del-canned]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hazır cevap silinsin mi?")) return;
      await api(`/admin/canned-replies/${b.dataset.delCanned}`, { method: "DELETE" });
      await loadCannedTable();
    })
  );
}

async function loadSupport() {
  await loadSupportListOnly();
  await loadCannedTable();
}

document.getElementById("cannedForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/admin/canned-replies", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("cannedTitle").value,
        category: document.getElementById("cannedCategory").value,
        body: document.getElementById("cannedBody").value,
      }),
    });
    e.target.reset();
    await loadCannedTable();
    alert("Hazır cevap kaydedildi");
  } catch (ex) {
    alert(ex.message);
  }
});

async function loadMethods() {
  const { methods } = await api("/admin/payment-methods");
  document.getElementById("methodsTable").innerHTML = `
    <thead><tr><th>Kod</th><th>Ad</th><th>Tip</th><th>Min/Max</th><th>Komisyon</th><th>Durum</th><th></th></tr></thead>
    <tbody>${methods
      .map(
        (m) => `<tr>
      <td>${m.code}</td><td>${m.name}</td><td>${m.type}</td>
      <td>${m.minAmount} / ${m.maxAmount}</td><td>%${m.feePercent}</td>
      <td>${m.active ? "Aktif" : "Pasif"}</td>
      <td><button data-method="${m.id}" data-on="${m.active ? "0" : "1"}">${m.active ? "Pasifleştir" : "Aktifleştir"}</button></td>
    </tr>`
      )
      .join("")}</tbody>`;
  document.querySelectorAll("[data-method]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/admin/payment-methods/${b.dataset.method}`, {
        method: "PUT",
        body: JSON.stringify({ active: b.dataset.on === "1" }),
      });
      await loadMethods();
    })
  );
}

async function refreshFinance() {
  await Promise.all([loadPayments(), loadDashboard()]);
}

async function refreshAll() {
  await Promise.all([
    loadDashboard(),
    loadUsers(),
    loadPayments(),
    loadKyc(),
    loadGames(),
    loadBonuses(),
    loadRisk(),
    loadAffiliates(),
    loadSupport(),
    loadMethods(),
  ]);
}

(async function boot() {
  if (!token()) return;
  try {
    const { user } = await api("/auth/me");
    if (user.role !== "ADMIN") throw new Error("not admin");
    showApp(true);
    await refreshAll();
  } catch {
    localStorage.removeItem(tokenKey);
  }
})();
