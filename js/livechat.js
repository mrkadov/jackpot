(function () {
  if (document.getElementById("liveChatRoot")) return;

  const CATEGORIES = [
    { code: "YATIRIM", label: "Yatırım İşlemleri" },
    { code: "CEKIM", label: "Çekim İşlemleri" },
    { code: "BONUS", label: "Bonus / Promosyon" },
    { code: "HESAP", label: "Hesap / Giriş" },
    { code: "OYUN", label: "Oyun Sorunları" },
    { code: "KYC", label: "KYC / Doğrulama" },
    { code: "GENEL", label: "Genel Destek" },
  ];

  const root = document.createElement("div");
  root.id = "liveChatRoot";
  root.innerHTML = `
    <button type="button" id="chatToggle" aria-label="Canlı destek">💬</button>
    <div id="chatPanel" class="hidden">
      <header>
        <strong>7/24 Canlı Destek</strong>
        <button type="button" id="chatClose">×</button>
      </header>
      <label class="chat-label" for="chatCategory">Sorun kategorisi</label>
      <select id="chatCategory">
        ${CATEGORIES.map((c) => `<option value="${c.code}">${c.label}</option>`).join("")}
      </select>
      <div id="chatMsgs"><p class="sys">Kategori seçip mesaj yazın. Yanıtlar anlık güncellenir.</p></div>
      <form id="chatForm">
        <textarea id="chatBody" rows="2" placeholder="Mesajınızı yazın..." required></textarea>
        <button type="submit">Gönder</button>
      </form>
      <small>VIP oyuncular öncelikli kuyruğa alınır.</small>
    </div>`;
  document.body.appendChild(root);

  const panel = document.getElementById("chatPanel");
  const msgs = document.getElementById("chatMsgs");
  let activeTicketId = null;
  let pollTimer = null;
  let lastCount = 0;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderMessages(ticket) {
    if (!ticket?.messages?.length) {
      msgs.innerHTML = `<p class="sys">Henüz mesaj yok. Yazmaya başlayın.</p>`;
      lastCount = 0;
      return;
    }
    msgs.innerHTML = ticket.messages
      .map((m) => {
        const who = m.sender === "USER" ? "Siz" : "Destek";
        const cls = m.sender === "USER" ? "me" : "agent";
        return `<p class="bubble ${cls}"><strong>${who}:</strong> ${escapeHtml(m.body)}<br><small>${new Date(m.createdAt).toLocaleTimeString("tr-TR")}</small></p>`;
      })
      .join("");
    lastCount = ticket.messages.length;
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function refreshTicket(force) {
    if (!window.JackpotAPI?.getToken() || !activeTicketId) return;
    try {
      const { ticket } = await JackpotAPI.api(`/player/support/${activeTicketId}`);
      if (force || (ticket.messages?.length || 0) !== lastCount) {
        renderMessages(ticket);
      }
    } catch (_) {
      /* ignore transient */
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => refreshTicket(false), 2000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  document.getElementById("chatToggle").onclick = async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      startPolling();
      await refreshTicket(true);
    } else {
      stopPolling();
    }
  };
  document.getElementById("chatClose").onclick = () => {
    panel.classList.add("hidden");
    stopPolling();
  };

  document.getElementById("chatCategory").addEventListener("change", () => {
    activeTicketId = null;
    lastCount = 0;
    msgs.innerHTML = `<p class="sys">Yeni kategori seçildi. Mesajınız bu konu başlığında iletilecek.</p>`;
  });

  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!window.JackpotAPI?.getToken()) {
      msgs.innerHTML += `<p class="err">Destek için giriş yapmalısınız.</p>`;
      return;
    }
    const body = document.getElementById("chatBody").value.trim();
    const category = document.getElementById("chatCategory").value;
    if (!body) return;
    try {
      const data = await JackpotAPI.api("/player/support", {
        method: "POST",
        body: JSON.stringify({
          category,
          ticketId: activeTicketId || undefined,
          subject: CATEGORIES.find((c) => c.code === category)?.label || "Canlı Destek",
          message: body,
        }),
      });
      activeTicketId = data.ticket.id;
      document.getElementById("chatBody").value = "";
      renderMessages(data.ticket);
      startPolling();
    } catch (ex) {
      msgs.innerHTML += `<p class="err">${escapeHtml(ex.message)}</p>`;
    }
  });
})();
