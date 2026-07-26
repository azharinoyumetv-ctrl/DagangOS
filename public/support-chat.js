(() => {
  const publicPath = /^(\/$|\/(produk|solusi|industri|tentang|sumber-daya)\/?$|\/(geraina|dapuros)(\/(pricing|login|register|activate))?\/?$)/;
  if (!publicPath.test(location.pathname)) return;

  const host = document.createElement("aside");
  host.className = "dagangos-support";
  host.setAttribute("aria-label", "Dukungan DagangOS");
  host.innerHTML = `
    <section class="dagangos-support__panel" aria-label="DagangOS support chat" hidden>
      <header class="dagangos-support__head">
        <div><b>DagangOS Support</b><small>Hermes · bantuan produk</small></div>
        <button class="dagangos-support__close" type="button" aria-label="Tutup support chat">×</button>
      </header>
      <div class="dagangos-support__messages" aria-live="polite"></div>
      <form class="dagangos-support__form">
        <label for="dagangos-support-message" hidden>Tulis pertanyaan</label>
        <textarea id="dagangos-support-message" rows="1" maxlength="2000" placeholder="Tanyakan produk, fitur, atau paket…"></textarea>
        <button class="dagangos-support__send" type="submit" aria-label="Kirim pesan">↑</button>
      </form>
      <div class="dagangos-support__contact">
        <span><a href="mailto:contact@dagangos.com">contact@dagangos.com</a> · <a href="https://wa.me/628999155182" target="_blank" rel="noopener noreferrer">+62 899 9155 182</a></span>
        <span>Subang, West Java, Indonesia</span>
      </div>
    </section>
    <button class="dagangos-support__launcher" type="button" aria-expanded="false" aria-label="Buka support chat">
      <img src="/assets/brand/dagangos-icon.png" alt="">
      <span>Tanya DagangOS</span><i>Online</i>
    </button>`;

  document.body.appendChild(host);

  const panel = host.querySelector(".dagangos-support__panel");
  const launcher = host.querySelector(".dagangos-support__launcher");
  const close = host.querySelector(".dagangos-support__close");
  const form = host.querySelector(".dagangos-support__form");
  const input = host.querySelector("textarea");
  const send = host.querySelector(".dagangos-support__send");
  const messages = host.querySelector(".dagangos-support__messages");
  const history = [];
  const conversationId = sessionStorage.getItem("dagangos_support_conversation")
    || (crypto.randomUUID ? crypto.randomUUID() : `visitor-${Date.now()}`);
  sessionStorage.setItem("dagangos_support_conversation", conversationId);

  const addMessage = (author, text, status = false) => {
    const message = document.createElement("p");
    message.className = `dagangos-support__message dagangos-support__message--${author}${status ? " dagangos-support__message--status" : ""}`;
    message.textContent = text;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  };

  addMessage("assistant", "Halo, saya Hermes. Saya bisa membantu menjelaskan produk, fitur, dan paket DagangOS.");

  const setOpen = (open) => {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Tutup support chat" : "Buka support chat");
    if (open) window.setTimeout(() => input.focus(), 40);
  };

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  window.addEventListener("dagangos:open-support-chat", () => setOpen(true));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;

    addMessage("visitor", message);
    history.push({ role: "user", content: message });
    input.value = "";
    send.disabled = true;
    const pending = addMessage("assistant", "Sedang menyiapkan jawaban…", true);

    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, messages: history.slice(-8) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Support chat sedang tidak tersedia.");
      pending.remove();
      const reply = payload.reply || "Silakan hubungi contact@dagangos.com untuk bantuan lebih lanjut.";
      addMessage("assistant", reply);
      history.push({ role: "assistant", content: reply });
    } catch (error) {
      pending.textContent = error?.message || "Support chat sedang tidak tersedia. Silakan coba kembali.";
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
})();
