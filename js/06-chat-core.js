// VaeltrixAI — Chat core: send, stop, regenerate, render, edit, typewriter

// ============ QUICK PROMPTS ============
const QP_ICONS = {
  email: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/></svg>`,
  cv: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  translate: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M9 2v2"/><path d="M22 22l-5-10-5 10M14 18h6"/></svg>`,
  summary: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg>`,
  idea: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.6 3.6 5.5V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.5c2.1-.9 3.6-3 3.6-5.5a7 7 0 0 0-7-7z"/></svg>`,
  code: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
};
function renderQuickPrompts() {
  const list = document.getElementById("qp-list");
  if (!list) return;
  list.innerHTML = QUICK_PROMPTS.map((p, i) => `
    <div class="qp-item" onclick="useQuickPrompt(${i})">
      <div class="qp-icon">${QP_ICONS[p.icon] || ""}</div>
      <div><div class="qp-title">${escHtml(p.title)}</div><div class="qp-desc">${escHtml(p.desc)}</div></div>
    </div>`).join("");
}
function openQuickPrompts() { document.getElementById("more-menu").classList.remove("open"); document.getElementById("qp-backdrop").classList.add("show"); }
function closeQuickPrompts() { document.getElementById("qp-backdrop").classList.remove("show"); }

// ============ QUICK PROMPT BAR (di atas input, kaya Grok) ============
function renderQpBar() {
  const bar = document.getElementById("qp-bar");
  if (!bar) return;
  bar.innerHTML = QUICK_PROMPTS.map((p, i) => `
    <button type="button" class="qp-chip" onclick="useQuickPrompt(${i})">
      ${QP_ICONS[p.icon] || ""}${escHtml(p.title)}
    </button>`).join("");
}
function useQuickPrompt(i) {
  const p = QUICK_PROMPTS[i];
  closeQuickPrompts();
  const input = document.getElementById("msg-input");
  input.value = p.text;
  input.focus();
  autoResize(input);
  input.setSelectionRange(input.value.length, input.value.length);
}


// ============ RENDER CHAT ============

function renderChat() {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";
  if (!currentSession || currentSession.messages.length === 0) {
    chat.innerHTML = `<div id="welcome">
      <div class="welcome-icon">
      <svg width="24" height="24" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
        fill-rule="evenodd" 
        clip-rule="evenodd" 
        d="M9.02 0 C9.44 0 9.84 0.17 10.14 0.46 L15.53 5.85 C15.83 6.15 15.99 6.55 15.99 6.97 V9.02 C15.99 9.44 15.83 9.84 15.53 10.14 L10.14 15.53 C9.84 15.83 9.44 15.99 9.02 15.99 H6.97 C6.55 15.99 6.15 15.83 5.85 15.53 L0.46 10.14 C0.17 9.84 0 9.44 0 9.02 V6.97 C0 6.55 0.17 6.15 0.46 5.85 L5.85 0.46 C6.15 0.17 6.55 0 6.97 0 L9.02 0 Z M9.5 2.5 C8.67 1.67 7.33 1.67 6.5 2.5 L2.5 6.5 C1.67 7.33 1.67 8.67 2.5 9.5 L6.5 13.5 C7.33 14.33 8.67 14.33 9.5 13.5 L13.5 9.5 C14.33 8.67 14.33 7.33 13.5 6.5 L9.5 2.5 Z" 
        fill="currentColor" 
    />
</svg>

</div>
      <div class="welcome-title">VAELTRIX</div>
      <div class="welcome-sub"><b>Your Intelligent AI Assistant For Coding, Reasoning, Writing, And Everyday Tasks.</b></div>
<div class="suggestions">
  <button class="suggestion-chip" onclick="sendSuggestion(this)">
    <!-- ikon lampu ide -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.6 3.6 5.5V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.5c2.1-.9 3.6-3 3.6-5.5a7 7 0 0 0-7-7zm0 12h-2v-2h2v2zm1.5-6.5c-.8.6-1.5 1.4-1.5 2.5h-2c0-1.5.9-2.8 2.2-3.5L12 5c-.6-.4-1-.9-1-1.5a1 1 0 1 1 2 0c0 .3-.2.5-.4.7z"/>
    </svg>
    Eksplorasi Ide Konten Kreatif
  </button>

  <button class="suggestion-chip" onclick="sendSuggestion(this)">
    <!-- ikon buku -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h16v2H4V4zm0 4h12v2H4V8zm0 4h16v2H4v-2zm0 4h12v2H4v-2z"/>
    </svg>
    Bantu Pemecahan Masalah
  </button>

  <button class="suggestion-chip" onclick="sendSuggestion(this)">
    <!-- ikon bug -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a2 2 0 0 1 2 2v1h3a1 1 0 0 1 .9.6l1.5 3a1 1 0 0 1-.2 1.1L16 11l1.2 2.4a1 1 0 0 1-.2 1.1l-2 2a1 1 0 0 1-1.4 0L12 13l-1.6 1.5a1 1 0 0 1-1.4 0l-2-2a1 1 0 0 1-.2-1.1L8 11l-2.8-1.7a1 1 0 0 1-.2-1.1l1.5-3A1 1 0 0 1 7 5h3V4a2 2 0 0 1 2-2zM9 7H7.2l-.9 1.8 1.1 2.1 1.6-1V7zm6 0v2.9l1.6 1 1.1-2.1L14.8 7H15z"/>
    </svg>
    Tinjau & Debug Kode
  </button>

  <button class="suggestion-chip" onclick="sendSuggestion(this)">
    <!-- ikon kalkulator -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 4v2h10V6H7zm0 4v2h10v-2H7zm0 4v2h6v-2H7z"/>
    </svg>
    Analisis Logika & Math
  </button>
</div>
      </div>`;
    return;
  }
  currentSession.messages.forEach(m => appendBubble(m.role, m.content, m.mode, false, m.id));
  chat.scrollTop = chat.scrollHeight;
}

function getModeLabel(mode) {
  if (mode === "code") return "Vaeltrix Code";
  if (mode === "maxs") return "Vaeltrix Maxs";
  if (mode === "research") return "Vaeltrix Deep Research";
  return "";
}
function getModeIconSvg(mode) {
  if (mode === "code") return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  if (mode === "maxs") return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>';
  if (mode === "research") return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  return "";
}

function appendBubble(role, content, mode, scroll = true, msgId = null, images = null, isStreaming = false) {
  const chat = document.getElementById("chat");
  document.getElementById("welcome")?.remove();

  const isPremiumMode = (mode === "code" || mode === "maxs" || mode === "research") && role !== "user";
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : (isPremiumMode ? "think-msg" : "ai")}`;
  if (msgId) wrap.id = `msgwrap-${msgId}`;

  const sender = document.createElement("div");
  sender.className = "msg-sender";
  if (role === "user") {
    sender.textContent = "";
  } else {
    const senderIcon = getModeIconSvg(mode);
    sender.style.cssText = "display:inline-flex;align-items:center;gap:5px;";
    sender.innerHTML = (senderIcon ? senderIcon : "") + getModeLabel(mode);
  }
  wrap.appendChild(sender);

  if (isPremiumMode) {
    const tag = document.createElement("div");
    tag.className = "think-tag";
    const tagIcon = mode === "code"
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
      : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>';
    tag.innerHTML = tagIcon + (mode === "code" ? "Mode Code" : "Mode Maxs");
    wrap.appendChild(tag);
  }

  if (role === "user" && images && images.length) {
    const imgRow = document.createElement("div");
    imgRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;";
    images.forEach(src => {
      const im = document.createElement("img");
      im.src = src; im.style.cssText = "width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--glass-border);cursor:pointer;";
      im.onclick = () => window.open(src, "_blank", "noopener,noreferrer");
      imgRow.appendChild(im);
    });
    wrap.appendChild(imgRow);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.id = msgId ? `bubble-${msgId}` : "";

  if (role === "user") {
    bubble.textContent = content;
    wrap.appendChild(bubble);

    if (msgId && !isSharedView) {
      const footer = document.createElement("div");
      footer.className = "bubble-footer";
      footer.style.gap = "8px";

      const editBtn = document.createElement("button");
      editBtn.className = "fb-btn";
      editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
      editBtn.title = "Edit Pesan";
      editBtn.setAttribute("aria-label", "Edit Pesan Ini");
      editBtn.addEventListener("click", () => startEditMessage(msgId));
      footer.appendChild(editBtn);

      const copyBtn = document.createElement("button");
      copyBtn.className = "fb-btn";
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      copyBtn.title = "Salin Pesan";
      copyBtn.setAttribute("aria-label", "Salin Pesan Ini");
      copyBtn.dataset.text = content;
      copyBtn.addEventListener("click", function() { copyBubble(this); });
      footer.appendChild(copyBtn);

      wrap.appendChild(footer);
    }
  } else {
    if (isStreaming && !content) {
      // Bubble kosong untuk streaming — jangan parse markdown & jangan footer dulu
      bubble.textContent = "";
      wrap.appendChild(bubble);
      chat.appendChild(wrap);
      if (scroll) chat.scrollTop = chat.scrollHeight;
      return bubble;
    }
    bubble.innerHTML = parseMarkdown(content);
    wrap.appendChild(bubble);
    enhanceBubble(bubble);
    bubble.dataset.raw = content;

    const id = msgId || `m${Date.now()}${Math.floor(Math.random()*1000)}`;

    const footer = document.createElement("div");
    footer.className = "bubble-footer";
    footer.style.gap = "8px";

    if (!isSharedView) {
      const regenBtn = document.createElement("button");
      regenBtn.className = "fb-btn";
      regenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
      regenBtn.title = "Generate Ulang Jawaban Ini";
      regenBtn.setAttribute("aria-label", "Generate Ulang Jawaban Ini");
      regenBtn.addEventListener("click", () => regenerateResponse(id));
      footer.appendChild(regenBtn);
    }

    const speakBtn = document.createElement("button");
    speakBtn.className = "fb-btn speak-btn";
    speakBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`;
    speakBtn.title = "Dengarkan";
    speakBtn.addEventListener("click", function() { toggleSpeak(bubble.dataset.raw ?? content, this); });
    footer.appendChild(speakBtn);

    const upBtn = document.createElement("button");
    upBtn.className = "fb-btn" + (vFeedback[id] === "up" ? " active-up" : "");
    upBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
    upBtn.addEventListener("click", function() { rateFeedback(id, "up", this); });
    footer.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.className = "fb-btn" + (vFeedback[id] === "down" ? " active-down" : "");
    downBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`;
    downBtn.addEventListener("click", function() { rateFeedback(id, "down", this); });
    footer.appendChild(downBtn);

    if (!isSharedView) {
      const shareBtn = document.createElement("button");
      shareBtn.className = "fb-btn";
      shareBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`;
      shareBtn.title = "Share Chat";
      shareBtn.setAttribute("aria-label", "Bagikan Chat Ini");
      shareBtn.addEventListener("click", () => openShareModal());
      footer.appendChild(shareBtn);
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    copyBtn.dataset.text = content;
    copyBtn.addEventListener("click", function() { copyBubble(this); });
    footer.appendChild(copyBtn);

    wrap.appendChild(footer);
    if (msgId) { try { attachArtifactButtons(wrap, msgId); } catch (e) {} }
  }

  chat.appendChild(wrap);
  if (scroll) chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function finalizeBubble(msgId, content) {
  const wrap = document.getElementById(`msgwrap-${msgId}`);
  const bubble = document.getElementById(`bubble-${msgId}`);
  if (!wrap || !bubble) {
    // Belum pernah di-append ke DOM — ini terjadi kalau responsnya gak lewat jalur streaming
    // (mis. mode Gemini: Flash/Code/Maxs/Research pakai endpoint non-streaming, jadi callback
    // onChunk yang biasanya bikin bubble gak pernah kepanggil). Bikin bubble-nya sekarang biar
    // jawabannya kelihatan, bukan cuma kesimpen diam-diam di riwayat chat.
    appendBubble("ai", content, currentMode, true, msgId);
    return;
  }

  bubble.innerHTML = parseMarkdown(content);
  enhanceBubble(bubble);
  bubble.dataset.raw = content;

  if (wrap.querySelector(".bubble-footer")) return;

  const id = msgId;
  const footer = document.createElement("div");
  footer.className = "bubble-footer";
  footer.style.gap = "8px";

  if (!isSharedView) {
    const regenBtn = document.createElement("button");
    regenBtn.className = "fb-btn";
    regenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    regenBtn.title = "Generate Ulang Jawaban Ini";
    regenBtn.setAttribute("aria-label", "Generate Ulang Jawaban Ini");
    regenBtn.addEventListener("click", () => regenerateResponse(id));
    footer.appendChild(regenBtn);
  }

  const speakBtn = document.createElement("button");
  speakBtn.className = "fb-btn speak-btn";
  speakBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`;
  speakBtn.title = "Dengarkan";
  speakBtn.addEventListener("click", function() { toggleSpeak(bubble.dataset.raw ?? content, this); });
  footer.appendChild(speakBtn);

  const upBtn = document.createElement("button");
  upBtn.className = "fb-btn" + (vFeedback[id] === "up" ? " active-up" : "");
  upBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  upBtn.addEventListener("click", function() { rateFeedback(id, "up", this); });
  footer.appendChild(upBtn);

  const downBtn = document.createElement("button");
  downBtn.className = "fb-btn" + (vFeedback[id] === "down" ? " active-down" : "");
  downBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`;
  downBtn.addEventListener("click", function() { rateFeedback(id, "down", this); });
  footer.appendChild(downBtn);

  if (!isSharedView) {
    const shareBtn = document.createElement("button");
    shareBtn.className = "fb-btn";
    shareBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`;
    shareBtn.title = "Share Chat";
    shareBtn.setAttribute("aria-label", "Bagikan Chat Ini");
    shareBtn.addEventListener("click", () => openShareModal());
    footer.appendChild(shareBtn);
  }

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  copyBtn.dataset.text = content;
  copyBtn.addEventListener("click", function() { copyBubble(this); });
  footer.appendChild(copyBtn);

  wrap.appendChild(footer);
  try { attachArtifactButtons(wrap, msgId); } catch (e) {}
  const chat = document.getElementById("chat");
  chat.scrollTop = chat.scrollHeight;
}

function showTyping(mode, label) {
  document.getElementById("welcome")?.remove();
  const chat = document.getElementById("chat");
  const wrap = document.createElement("div");
  wrap.className = "typing-wrap"; wrap.id = "typing-indicator";
  const sender = document.createElement("div");
  sender.className = "msg-sender"; sender.textContent = label || "";
  wrap.appendChild(sender);
  const isThink = mode === "code" || mode === "maxs" || mode === "research";

  // Banner "Sedang Berjalan Di Latar Belakang" — pake icon spark custom Vaeltrix (bukan logo
  // Claude, ini punya sendiri: diamond 4-titik biru/gold). Teksnya jujur ke kondisi app statis
  // client-side ini: valid SELAMA tab/app masih hidup (diminimize/pindah app sebentar), bukan
  // janji "tetap jalan walau app ditutup total" — lihat catatan di checkInterruptedMessages()
  /* di 03-init.js buat penjelasan lengkap kenapa itu beda cerita.
  const banner = document.createElement("div");
  banner.className = "bg-running-banner";
  banner.innerHTML = ``;
  wrap.appendChild(banner);*/

  const dots = document.createElement("div");
  dots.className = "typing-dots" + (isThink ? " think-typing" : "");
  dots.innerHTML = "<span></span><span></span><span></span>";
  wrap.appendChild(dots);
  
  /*
  const skel = document.createElement("div");
  skel.className = "skeleton-wrap" + (isThink ? " think-typing-skel" : "");
  skel.innerHTML = `<div class="skeleton-line" style="width:180px"></div><div class="skeleton-line" style="width:120px"></div>`;
  wrap.appendChild(skel);*/

  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}
function removeTyping() { document.getElementById("typing-indicator")?.remove(); }

// ============ TYPEWRITER REVEAL ============
// Groq generate super cepat, jadi chunk suka datang nyaris sekaligus. Biar tetap "muncul satu-satu"
// kayak Claude/Kimi, teks yang masuk ditaruh di buffer dan ditampilkan bertahap lewat interval sendiri,
// bukan langsung di-paint semua. Kalau buffer numpuk banyak (jaringan lag/meledak, ATAU abis app
// diminimize lama terus dibuka lagi jadi banyak karakter numpuk nunggu ditampilin), kecepatan reveal
// otomatis nambah proporsional ke ukuran numpukannya, biar visualnya ngejar teks asli, bukan
// ketinggalan lambat 1 karakter/12ms terus-terusan.
//
// Render tiap tick sekarang lewat parseMarkdown() (BUKAN textContent mentah lagi) — jadi bold,
// heading, list, tabel, dan (yang paling penting) CODE BLOCK udah kebentuk kotaknya secara
// real-time selagi masih ngetik, persis kayak ChatGPT/Claude, bukan nunggu jawaban kelar dulu baru
// dirapiin. Ini jalan buat SEMUA mode/model (Gemini Flash/Code/Maxs/Research maupun Groq/WebLLM)
// karena semuanya lewat fungsi createTypewriter yang sama ini, bukan cuma mode tertentu.
function createTypewriter(getBubbleEl, opts = {}) {
  const tickMs = opts.tickMs ?? 12;
  const enhanceThrottleMs = opts.enhanceThrottleMs ?? 90; // jarak minimal antar syntax-highlight/KaTeX ulang
  let shown = "";
  let target = "";
  let charQueue = "";
  let timer = null;
  let finished = false;
  let lastEnhanceAt = 0;

  function render(forceEnhance) {
    const el = getBubbleEl();
    if (!el) return;

    el.innerHTML = parseMarkdown(shown);

    // Cursor kedip pakai elemen DOM + CSS terpisah (bukan numpuk karakter "▌" ke teks) — biar
    // gak ganggu parsing markdown/code block kalau posisi cursor lagi persis di tengah simbol.
    if (!finished) {
      const cursor = document.createElement("span");
      cursor.className = "stream-cursor";
      el.appendChild(cursor);
    }

    // hljs/KaTeX itu berat kalau dijalanin ULANG tiap karakter (bisa 80+x/detik) — di-throttle
    // biar HP gak lag, tapi tetap "hidup" (nge-refresh warna kode tiap ~90ms selama streaming).
    const now = Date.now();
    if (forceEnhance || now - lastEnhanceAt >= enhanceThrottleMs) {
      lastEnhanceAt = now;
      try { enhanceBubble(el); } catch (e) {}
    }

    const chatEl = document.getElementById("chat");
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }

  function tick() {
    timer = null;
    if (finished) return;
    if (charQueue.length > 0) {
      // Backlog kecil (streaming normal) → tetap 1 karakter/tick, kerasa kayak ngetik.
      // Backlog gede (chunk numpuk pas balik dari background, dsb) → ambil beberapa karakter
      // sekaligus per tick, makin gede numpukannya makin ngebut, biar nyusul teks aslinya.
      let revealCount = 1;
      if (charQueue.length > 500) revealCount = Math.ceil(charQueue.length / 25);
      else if (charQueue.length > 120) revealCount = Math.ceil(charQueue.length / 15);

      shown += charQueue.slice(0, revealCount);
      charQueue = charQueue.slice(revealCount);
      target = shown + charQueue;
      render();
      timer = setTimeout(tick, tickMs);
      return;
    }
    if (shown.length < target.length) {
      shown = target;
      render();
    }
  }

  return {
    pushChunk(fullText) {
      if (fullText.length <= target.length) {
        target = fullText;
        charQueue = "";
        shown = target;
        if (timer) { clearTimeout(timer); timer = null; }
        render();
        return;
      }
      const newChars = fullText.slice(target.length);
      target = fullText;
      charQueue += newChars;
      if (!timer) timer = setTimeout(tick, tickMs);
    },
    waitUntilCaughtUp() {
      return new Promise(resolve => {
        (function check() {
          if (!timer && charQueue.length === 0 && shown.length >= target.length) resolve();
          else setTimeout(check, tickMs);
        })();
      });
    },
    finish() {
      finished = true;
      if (timer) { clearTimeout(timer); timer = null; }
      shown = target;
      render(true);
    },
    stop() {
      finished = true;
      if (timer) { clearTimeout(timer); timer = null; }
    }
  };
}


// ============ SEND ============
function sendSuggestion(btn) {
  document.getElementById("msg-input").value = btn.textContent.trim();
  sendMessage();
}

function isTouchDevice() {
  return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0;
}
function handleKey(e) {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (isTouchDevice()) return; // Di HP/tablet: Enter = baris baru, kirim lewat tombol panah
  e.preventDefault();
  sendMessage();
}
let autoResizeRAF = null;
// Sebelumnya autoResize maksa browser ngitung ulang layout (reflow) tiap 1 huruf diketik/dihapus —
// kalau lagi ada proses lain jalan bareng (misal Vaeltrix Live nyangkut kayak di atas), ini kerasa
// numpuk & bikin ngetik jadi lag. Sekarang dijadwalin lewat requestAnimationFrame & di-throttle biar
// gak numpuk-numpuk kalau user ngetik cepet — kerasa lebih ringan kayak Claude/ChatGPT.
function autoResize(el) {
  if (autoResizeRAF) return;
  autoResizeRAF = requestAnimationFrame(() => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
    autoResizeRAF = null;
  });
}

async function sendMessage() {
  if (isSharedView) return;
  const input = document.getElementById("msg-input");
  const text  = input.value.trim();
  if ((!text && !pendingAttachments.length) || isTyping) return;

  if (imageGenMode) { await sendImageGenMessage(text); return; }
  if (imageEditMode) { await sendImageEditMessage(text); return; }

  if (detectJailbreak(text)) {
    input.value = "";
    appendBubble("ai", "**Jailbreak Blok!**\n\nSaya Tidak Bisa Memproses Permintaan Tersebut, Tuan. Saya Adalah Vaeltrix, AI Dari VaeltrixLabs, Dan Tetap Beroperasi Sesuai Pedoman Yang Telah Ditetapkan.", currentMode);
    return;
  }

  // Free & Premium sama-sama punya limit sekarang (dulu Premium unlimited) — cuma angkanya beda.
  const currentLimit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
  if (freeCount >= currentLimit) { showLimitBanner(); return; }

  const titleSeed = text || (pendingAttachments[0]?.name ?? "Chat Baru");
  if (!currentSession) {
    currentSession = { id: Date.now(), title: titleSeed.slice(0,32) + (titleSeed.length > 32 ? "…" : ""), messages: [], mode: currentMode };
    sessions.unshift(currentSession); renderHistory();
  }
  if (currentSession.messages.length === 0) {
    currentSession.title = titleSeed.slice(0,32) + (titleSeed.length > 32 ? "…" : "");
    currentSession.mode  = currentMode;
    renderHistory();
  }

  const imageAttachments = pendingAttachments.filter(a => a.isImage);
  const imageUrls = imageAttachments.map(a => a.dataUrl).filter(u => u && u.startsWith("data:image/"));
  // VX-VISION-005 — kalau ada lampiran yang DITANDAIN gambar tapi payload-nya gak valid pas mau
  // dikirim (harusnya udah ketangkep pas processAttachment, ini jaring pengaman lapis kedua),
  // STOP sebelum kirim — jangan biarin AI kirim jawaban ngasal karena "gambarnya" cuma teks kosong.
  if (imageAttachments.length > imageUrls.length) {
    showToast("Gambar Belum Siap Dikirim, Coba Lampirkan Ulang, Tuan.", true);
    return;
  }
  let extraContext = pendingAttachments.filter(a => !a.isImage && a.textContent)
    .map(a => wrapUntrustedContext(`Isi File: ${a.name}`, a.textContent)).filter(Boolean).join("\n\n");
  const fileNames = pendingAttachments.map(a => a.name);
  pendingAttachments = []; renderAttachmentChips();

  // Vaeltrix Projects: kalau chat ini ada di dalam sebuah Project, suntik instruksi khusus +
  // file referensi project ke context (try/catch biar gak pernah ganggu alur kirim pesan utama).
  if (currentSession.projectId) {
    try {
      const activeProject = projects.find(p => p.id === currentSession.projectId);
      if (activeProject) extraContext = [buildProjectContext(activeProject), extraContext].filter(Boolean).join("\n\n");
    } catch (e) {}
  }

  input.value = ""; input.style.height = "auto";
  clearDraft();
  isTyping = true; setSendBtnState("stop");

  const userMsgId = `u${Date.now()}`;
  let displayContent = text;
  if (fileNames.length) displayContent += (displayContent ? "\n\n" : "") + `${fileNames.join(", ")}`;
  // VISION FIX: gambar sekarang IKUT DISIMPEN di message object (bukan cuma dikirim sekali lewat
  // opts.images pas turn ini doang). Sebelumnya begitu turn ini kelar, currentSession.messages
  // cuma nyimpen `content: "Analisis gambar ini\n\nScreenshot.jpg"` — TEKS DOANG, data gambar
  // aslinya ilang. Di turn BERIKUTNYA (mis. user nanya "warna dominannya apa?"), historyForApi
  // yang dikirim ke buildGroqMessages cuma punya filename sebagai STRING biasa, BUKAN actual image
  // data — persis kasus buruk yang dimaksud spec: text mengandung nama file, bukan text + image
  // beneran. Thumbnail di UI tetep muncul (itu cuma rendering, appendBubble dikasih imageUrls
  // terpisah), jadi KELIHATANNYA gambarnya "masih ada" padahal AI udah gak bisa liat lagi.
  currentSession.messages.push({ role: "user", content: displayContent, mode: currentMode, id: userMsgId, images: imageUrls.length ? imageUrls : undefined });
  appendBubble("user", displayContent, currentMode, true, userMsgId, imageUrls);
  trackStat(currentMode);
  saveSessions();

  if (isOfflineModeEnabled() && isPremium && !navigator.onLine) {
    const offlineMsgId = `a${Date.now()}`;
    const offlineNotice = "**Offline Mode Aktif**\n\nKamu Lagi Nggak Ada Koneksi Internet, Tuan. Tenang, Pesan Kamu Sudah Aku Simpan Aman Secara Lokal Di Device Ini — Tinggal Kirim Ulang (Tap Tombol Kirim) Begitu Internet Kamu Nyala Lagi, Vaeltrix Langsung Jawab.";
    appendBubble("ai", offlineNotice, currentMode, true, offlineMsgId);
    currentSession.messages.push({ role: "ai", content: offlineNotice, mode: currentMode, id: offlineMsgId });
    saveSessions();
    isTyping = false; setSendBtnState("send");
    document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
    return;
  }

  // P0.3 fix: sebelumnya web search di sini SEPENUHNYA gantung ke toggle global
  // isWebSearchEnabled() — gak ada hubungannya sama mode yang lagi aktif. Akibatnya, mode
  // "Vaeltrix Deep Research" bisa jalan TANPA akses web sama sekali kalau user kebetulan belum
  // pernah nyalain toggle itu, padahal system prompt-nya (07-providers.js) eksplisit ngeklaim
  // "Investigation, Evidence gathering, Source Evaluation, Cross-check" — jawabannya jadi cuma
  // dari training data doang, TAPI tetep "keliatan" kayak hasil riset. Sekarang mode Research
  // MEMASTIKAN web search nyala sendiri, gak nunggu toggle manual yang gak terkait.
  const shouldSearch = isWebSearchEnabled() || currentMode === "research";
  if (shouldSearch && text) {
    showTyping(currentMode, currentMode === "research" ? "Merencanakan Riset..." : "Mencari Di Web...");
    try {
      // Phase 6: mode Research sekarang lewat pipeline multi-query (planResearchQueries ->
      // beberapa performWebSearch paralel), bukan performWebSearch tunggal kayak sebelumnya.
      // Toggle web search manual (di luar mode Research) TETAP 1 query apa adanya -- gak perlu
      // pipeline berat buat itu.
      const results = currentMode === "research"
        ? await performDeepResearch(text, (msg) => showTyping(currentMode, msg))
        : await performWebSearch(text, "basic");
      const contextLabel = currentMode === "research" ? `Hasil Riset Mendalam Untuk: "${text}"` : `Hasil Pencarian Web Untuk: "${text}"`;
      extraContext = [extraContext, wrapUntrustedContext(contextLabel, results)].filter(Boolean).join("\n\n");
    } catch (e) {
      if (currentMode === "research") {
        // Beda dari mode lain: di sini AI-nya PERLU tau pencarian gagal, biar dia jujur bilang
        // "gak berhasil ambil sumber terbaru" di jawabannya — bukan diam-diam jawab dari training
        // data doang sambil tetep kesan "hasil riset". wrapUntrustedContext tetep dipakai (isinya
        // cuma catatan status, bukan instruksi user, tapi konsisten aja formatnya).
        extraContext = [extraContext, wrapUntrustedContext("Status Pencarian Web", "Pencarian web GAGAL untuk topik ini. Kamu HARUS bilang terus terang ke user bahwa jawaban ini TIDAK berbasis sumber web terkini (cuma dari pengetahuan internal), bukan hasil riset — jangan berpura-pura sudah cross-check sumber.")].filter(Boolean).join("\n\n");
      }
      showToast("Pencarian Web Gagal, Lanjut Tanpa Hasil Pencarian", true);
    }
    removeTyping();
  }
  showTyping(currentMode);

  let streamWrapId = null;
  let lastPartial = "";
  let typewriter = null;
  const aiMsgId = `a${Date.now()}`;

  let thinkingBlock = null;
  let thinkingBody = null;
  let thinkStartTime = null;
  // Kapan token jawaban ASLI (bukan reasoning) pertama kali nyampe — dipakai buat misahin durasi
  // "beneran mikir" dari durasi generate+ngetik jawabannya sendiri. Lihat catatan di label elapsed
  // di bawah buat kenapa ini penting (sebelumnya "Berpikir Selama" ikut ngitung waktu generate +
  // waktu efek ketikan typewriter, jadi kelihatan jauh lebih lama dari reasoning aslinya).
  let reasoningEndTime = null;
  // v1.8.0 — metric terpisah (spec: "Pisahkan requestStart → TTFT → reasoningDuration →
  // generationDuration → totalDuration"). firstTokenTime dicatat sekali di token PERTAMA yang
  // nyampe dari provider, apapun jenisnya (thinking ATAU jawaban langsung) — ini yang disimpen
  // sebagai TTFT jujur, beda dari reasoningEndTime yang khusus nandain transisi reasoning→jawaban.
  let firstTokenTime = null;
  function markFirstToken() { if (firstTokenTime === null) firstTokenTime = Date.now(); }

  function ensureThinkingBlock() {
    if (thinkingBlock) return;
    thinkStartTime = Date.now();
    const chatEl = document.getElementById("chat");
    const wrap = document.createElement("div");
    wrap.className = "msg think-block-msg";
    wrap.id = `thinkwrap-${aiMsgId}`;

    const sender = document.createElement("div");
    sender.className = "msg-sender";
    sender.innerHTML = getModeIconSvg(currentMode) + " Berpikir";
    wrap.appendChild(sender);

    const block = document.createElement("div");
    block.className = "thinking-block collapsed";
    block.id = `thinking-${aiMsgId}`;

    const header = document.createElement("div");
    header.className = "thinking-header";
    header.innerHTML = `<svg class="thinking-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> <span class="thinking-pulse"></span><span class="thinking-label">Berpikir</span>`;
    header.onclick = () => block.classList.toggle("collapsed");

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "thinking-body-wrap";

    const body = document.createElement("div");
    body.className = "thinking-body";
    body.id = `thinking-body-${aiMsgId}`;
    bodyWrap.appendChild(body);

    block.appendChild(header);
    block.appendChild(bodyWrap);
    wrap.appendChild(block);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    thinkingBlock = block;
    thinkingBody = body;
  }

  // Simpan placeholder "sedang diproses" SEBELUM manggil API (bukan sesudah) — biar kalau
  // app/tab ke-close atau di-reload di tengah proses, sesi yang tersimpan di localStorage masih
  // punya jejak "pesan ini belum kelar dijawab", bukan cuma ilang tanpa bekas. Detail lengkap
  // soal kenapa app TETAP HARUS DIBUKA biar proses ini jalan (gak bisa lanjut kalau app beneran
  // ditutup total) ada di initSessions()/checkInterruptedMessages() di 03-init.js.
  const pendingMsg = { role: "ai", content: "", mode: currentMode, id: aiMsgId, pending: true, startedAt: Date.now() };
  currentSession.messages.push(pendingMsg);
  saveSessions();

  // PENTING: pendingMsg di atas SENGAJA disimpan di currentSession.messages (buat jejak
  // "belum kelar" kalau app ke-close). TAPI dia gak boleh ikut dikirim ke provider — kalau
  // ikut, dia jadi entry TERAKHIR di history dengan role "ai"/model dan content kosong, dan
  // Gemini nolak keras request yang endingnya role "model" ("Requests ending with a model
  // turn are not supported"). Makanya di sini history-nya di-filter dulu, buang semua yang
  // masih `pending` sebelum dikirim ke callGemini.
  const historyForApi = currentSession.messages.filter(m => !m.pending);

  currentAbortController = new AbortController();
  const clearReqTimeout = startRequestTimeout(currentAbortController, currentMode);
  const requestStartTime = Date.now();
  try {
    const result = await callGemini(
      historyForApi, currentMode,
      { images: imageUrls, extraContext, rawText: text, signal: currentAbortController.signal, backendConversationId: currentSession.backendConversationId, projectId: (typeof projects !== "undefined" ? projects.find(p => p.id === currentSession.projectId)?.backendProjectId : undefined) },
      (partial) => {
        lastPartial = partial;
        markFirstToken();
        if (!streamWrapId) {
          removeTyping();
          appendBubble("ai", "", currentMode, true, aiMsgId, null, true);
          streamWrapId = aiMsgId;
          typewriter = createTypewriter(() => document.getElementById(`bubble-${aiMsgId}`));
        }
        // Token jawaban PERTAMA yang beneran nyampe = itu momen reasoning-nya kelar (Gemini/Groq
        // udah misahin "thought"/reasoning dari jawaban final di stream-nya, lihat 07-providers.js).
        // Dicatat sekali doang (guard reasoningEndTime === null), dipakai buat label "Berpikir
        // Selama" di bawah — BUKAN dari Date.now() pas typewriter kelar ngetik semuanya.
        if (reasoningEndTime === null) reasoningEndTime = Date.now();
        typewriter.pushChunk(partial);
      },
      (thinkingText) => {
        if (!thinkingText.trim()) return;
        markFirstToken();
        ensureThinkingBlock();
        if (thinkingBody) thinkingBody.textContent = thinkingText;
        const chatEl = document.getElementById("chat");
        chatEl.scrollTop = chatEl.scrollHeight;
      }
    );

    removeTyping();
    let replyText = (typeof result === "string") ? result : (result?.text || "");
    replyText = autoFenceRawCode(replyText);

    if (typewriter) { await typewriter.waitUntilCaughtUp(); typewriter.finish(); }

    finalizeBubble(aiMsgId, replyText);

    // Phase 2: kalau jawaban ini lewat backend VaeltrixLabs, simpen conversationId-nya biar pesan
    // BERIKUTNYA di sesi lokal ini nyambung ke percakapan backend yang SAMA (bukan bikin baru
    // tiap kirim pesan). Tidak ngapa-ngapain kalau result.conversationId gak ada (jalur BYOK lama).
    if (result?.conversationId) {
      currentSession.backendConversationId = result.conversationId;
      saveSessions();
    }

    const thinkWrap = document.getElementById(`thinkwrap-${aiMsgId}`);
    if (thinkWrap && (!result?.thinking || !result.thinking.trim())) {
      thinkWrap.remove();
    } else if (thinkWrap) {
      const block = document.getElementById(`thinking-${aiMsgId}`);
      if (block) {
        // Sebelumnya di sini pakai Date.now() langsung — artinya "elapsed" ikut ngitung durasi
        // generate jawaban + durasi typewriter ngetikin ke layar, bukan cuma durasi mikirnya doang.
        // Itu penyebab bug "Berpikir Selama 1589 Detik" walau reasoning aslinya cuma belasan detik.
        // reasoningEndTime (dicatat pas token jawaban pertama nyampe) = penanda yang jujur soal
        // kapan reasoning-nya beneran berhenti.
        const elapsed = Math.max(1, Math.round(((reasoningEndTime || Date.now()) - thinkStartTime) / 1000));
        block.querySelector(".thinking-pulse")?.remove();
        const label = block.querySelector(".thinking-label");
        if (label) label.textContent = `Berpikir Selama ${elapsed} Detik`;
      }
    }

    // Ganti placeholder pending jadi hasil final (BUKAN push baru — placeholder-nya udah ada
    // dari sebelum manggil API di atas, kalau di-push lagi bakal dobel).
    // v1.8.0 — metric internal per-pesan (spec: "buat internal response format... reasoning,
    // reasoningDuration, ttft, generationDuration, totalDuration"). Field null kalau memang gak
    // kesedia (mis. gak ada thinking block sama sekali) — BUKAN diisi angka karangan.
    const totalMs = Date.now() - requestStartTime;
    const metrics = {
      ttftMs: firstTokenTime ? (firstTokenTime - requestStartTime) : null,
      reasoningMs: (thinkStartTime && reasoningEndTime) ? (reasoningEndTime - thinkStartTime) : null,
      generationMs: reasoningEndTime ? (Date.now() - reasoningEndTime) : null,
      totalMs,
      // Section 17 brief: metadata diagnostics — provider/model yang BENERAN kepake, dan apakah ini
      // hasil fallback (mis. Gemini/Groq gagal, jatuh ke OpenRouter) — kegunaan: kalau user
      // ngerasa jawaban "beda kualitasnya", ini nunjukkin apa beneran ada fallback yang kejadian.
      provider: result?.provider ?? null,
      model: result?.model ?? null,
      fallbackUsed: result?.fallbackUsed ?? false,
    };
    replacePendingMessage(aiMsgId, { role: "ai", content: replyText, mode: currentMode, id: aiMsgId, metrics });
    clearReqTimeout();
    // Dulu cuma dihitung buat user gratis (`if (!isPremium)`) — sekarang Premium juga dihitung
    // karena Premium sekarang punya limit sendiri (60/jam), bukan unlimited lagi.
    freeCount++; localStorage.setItem("vaeltrix_free_count", freeCount); updateCounter();
    saveSessions();
    notifyIfBackground("VaeltrixAI", "Jawaban Kamu Udah Siap, Tuan!");
    updateMemoryFromMessage(text);
    if (currentSession.messages.length === 2 && !currentSession.titleGenerated) {
      generateSmartTitle(currentSession);
    }
  } catch (err) {
    clearReqTimeout();
    typewriter?.stop();
    removeTyping();
    // Timeout otomatis (P0.6) DAN Stop manual sama-sama muncul sebagai AbortError di level
    // fetch() — dibedain lewat signal.reason yang kita set sendiri di startRequestTimeout().
    const isTimeout = err.name === "AbortError" && currentAbortController.signal.reason?.name === "TimeoutError";
    if (isTimeout) {
      if (lastPartial.trim()) {
        const stoppedText = lastPartial + "\n\n_(Request Timeout! Koneksi Kelamaan, Coba Lagi Ya Tuan)_";
        finalizeBubble(aiMsgId, stoppedText);
        replacePendingMessage(aiMsgId, { role: "ai", content: stoppedText, mode: currentMode, id: aiMsgId });
        saveSessions();
      } else {
        document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
        document.getElementById(`thinkwrap-${aiMsgId}`)?.remove();
        removePendingMessage(aiMsgId);
        saveSessions();
      }
      console.warn("[VX-NET-TIMEOUT] Request timeout");
      showToast("Request Timeout! Coba Lagi, Tuan", true);
    } else if (err.name === "AbortError") {
      if (lastPartial.trim()) {
        const stoppedText = lastPartial + "\n\n_(Dihentikan Oleh Pengguna)_";
        finalizeBubble(aiMsgId, stoppedText);
        replacePendingMessage(aiMsgId, { role: "ai", content: stoppedText, mode: currentMode, id: aiMsgId });
        saveSessions();
      } else {
        document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
        document.getElementById(`thinkwrap-${aiMsgId}`)?.remove();
        removePendingMessage(aiMsgId);
        saveSessions();
      }
      showToast("Generate Dihentikan");
    } else {
      document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
      document.getElementById(`thinkwrap-${aiMsgId}`)?.remove();
      // v1.8.0: pesan yang ditampilin sekarang udah dinormalisasi (friendlyVxMessage) — bukan lempar
      // mentah-mentah teks error dari provider ke user. Kode VX-nya tetep dicatat di console biar
      // gampang di-debug tanpa nge-bocorin detail internal ke UI.
      if (err.vxCode) console.warn(`[${err.vxCode}]`, err.message);
      showToast(friendlyVxMessage(err), true);
      removePendingMessage(aiMsgId);
      saveSessions();
    }
  }

  currentAbortController = null;
  isTyping = false; setSendBtnState("send");
  document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
}

// Ganti message pending (masih diproses) jadi versi final di array currentSession.messages —
// dicari berdasarkan id, bukan asumsi "selalu elemen terakhir", biar aman dipanggil dari
// beberapa alur berbeda (selesai normal, di-stop manual, dst).
function replacePendingMessage(id, finalMsg) {
  if (!currentSession) return;
  const idx = currentSession.messages.findIndex(m => m.id === id);
  if (idx >= 0) currentSession.messages[idx] = finalMsg;
  else currentSession.messages.push(finalMsg);
}
function removePendingMessage(id) {
  if (!currentSession) return;
  currentSession.messages = currentSession.messages.filter(m => m.id !== id);
}

// ============ STOP GENERATION ============
function stopGeneration() {
  if (currentAbortController) currentAbortController.abort();
}

function setSendBtnState(mode) {
  const btn = document.getElementById("send-btn");
  if (!btn) return;
  if (mode === "stop") {
    btn.disabled = false;
    btn.classList.add("stop-mode");
    btn.title = "Hentikan Generate";
    btn.setAttribute("aria-label", "Hentikan Generate");
    btn.onclick = stopGeneration;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="black" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  } else {
    btn.disabled = false;
    btn.classList.remove("stop-mode");
    btn.title = "";
    btn.setAttribute("aria-label", "Kirim Pesan");
    btn.onclick = sendMessage;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 20V5" stroke="black" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M5.5 11.5L12 5L18.5 11.5" stroke="black" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
  }
}

// ============ REGENERATE RESPONSE ============
async function regenerateResponse(msgId) {
  if (isSharedView) return;
  if (isTyping) { showToast("Tunggu Balasan Vaeltrix Selesai Dulu Ya", true); return; }
  const idx = currentSession?.messages.findIndex(m => m.id === msgId);
  if (idx === undefined || idx === -1) return;
  const oldMsg = currentSession.messages[idx];
  if (oldMsg.role !== "ai") return;
  const mode = oldMsg.mode || currentMode;

  currentSession.messages = currentSession.messages.slice(0, idx);
  document.getElementById(`msgwrap-${msgId}`)?.remove();
  document.getElementById(`thinkwrap-${msgId}`)?.remove();
  saveSessions();

  isTyping = true; setSendBtnState("stop");
  showTyping(mode);

  let streamWrapId = null;
  let lastPartial = "";
  let typewriter = null;
  const newAiId = `a${Date.now()}`;

  let thinkingBlock = null;
  let thinkingBody = null;
  let reasoningEndTime = null;
  let thinkStartTime = null;
  let firstTokenTime = null;
  function markFirstToken() { if (firstTokenTime === null) firstTokenTime = Date.now(); }

  function ensureThinkingBlock() {
    if (thinkingBlock) return;
    thinkStartTime = Date.now();
    const chatEl = document.getElementById("chat");
    const wrap = document.createElement("div");
    wrap.className = "msg think-block-msg";
    wrap.id = `thinkwrap-${newAiId}`;

    const sender = document.createElement("div");
    sender.className = "msg-sender";
    sender.innerHTML = getModeIconSvg(mode) + " Berpikir";
    wrap.appendChild(sender);

    const block = document.createElement("div");
    block.className = "thinking-block collapsed";
    block.id = `thinking-${newAiId}`;

    const header = document.createElement("div");
    header.className = "thinking-header";
    header.innerHTML = `<svg class="thinking-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> <span class="thinking-pulse"></span><span class="thinking-label">Berpikir</span>`;
    header.onclick = () => block.classList.toggle("collapsed");

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "thinking-body-wrap";

    const body = document.createElement("div");
    body.className = "thinking-body";
    body.id = `thinking-body-${newAiId}`;
    bodyWrap.appendChild(body);

    block.appendChild(header);
    block.appendChild(bodyWrap);
    wrap.appendChild(block);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    thinkingBlock = block;
    thinkingBody = body;
  }

  currentAbortController = new AbortController();
  const clearReqTimeout = startRequestTimeout(currentAbortController, mode);
  const requestStartTime = Date.now();
  try {
    const result = await callGemini(
      currentSession.messages, mode, { signal: currentAbortController.signal, backendConversationId: currentSession.backendConversationId },
      (partial) => {
        lastPartial = partial;
        markFirstToken();
        if (!streamWrapId) {
          removeTyping();
          appendBubble("ai", "", mode, true, newAiId, null, true);
          streamWrapId = newAiId;
          typewriter = createTypewriter(() => document.getElementById(`bubble-${newAiId}`));
        }
        if (reasoningEndTime === null) reasoningEndTime = Date.now();
        typewriter.pushChunk(partial);
      },
      (thinkingText) => {
        if (!thinkingText.trim()) return;
        markFirstToken();
        ensureThinkingBlock();
        if (thinkingBody) thinkingBody.textContent = thinkingText;
        const chatEl = document.getElementById("chat");
        chatEl.scrollTop = chatEl.scrollHeight;
      }
    );
    removeTyping();
    let replyText = (typeof result === "string") ? result : (result?.text || "");
    replyText = autoFenceRawCode(replyText);
    if (typewriter) { await typewriter.waitUntilCaughtUp(); typewriter.finish(); }
    finalizeBubble(newAiId, replyText);

    // Phase 2: sama seperti jalur kirim pesan biasa -- simpen conversationId backend kalau ada.
    if (result?.conversationId) {
      currentSession.backendConversationId = result.conversationId;
      saveSessions();
    }

    const thinkWrap = document.getElementById(`thinkwrap-${newAiId}`);
    if (thinkWrap && (!result?.thinking || !result.thinking.trim())) {
      thinkWrap.remove();
    } else if (thinkWrap) {
      const block = document.getElementById(`thinking-${newAiId}`);
      if (block) {
        const elapsed = Math.max(1, Math.round(((reasoningEndTime || Date.now()) - thinkStartTime) / 1000));
        block.querySelector(".thinking-pulse")?.remove();
        const label = block.querySelector(".thinking-label");
        if (label) label.textContent = `Berpikir Selama ${elapsed} Detik`;
      }
    }

    const metrics = {
      ttftMs: firstTokenTime ? (firstTokenTime - requestStartTime) : null,
      reasoningMs: (thinkStartTime && reasoningEndTime) ? (reasoningEndTime - thinkStartTime) : null,
      generationMs: reasoningEndTime ? (Date.now() - reasoningEndTime) : null,
      totalMs: Date.now() - requestStartTime,
      provider: result?.provider ?? null,
      model: result?.model ?? null,
      fallbackUsed: result?.fallbackUsed ?? false,
    };
    currentSession.messages.push({ role: "ai", content: replyText, mode, id: newAiId, metrics });
    saveSessions();
    clearReqTimeout();
  } catch (err) {
    clearReqTimeout();
    typewriter?.stop();
    removeTyping();
    const isTimeout = err.name === "AbortError" && currentAbortController.signal.reason?.name === "TimeoutError";
    if (isTimeout) {
      if (lastPartial.trim()) {
        const stoppedText = lastPartial + "\n\n_(Request Timeout! Koneksi Kelamaan, Coba Lagi Ya Tuan)_";
        finalizeBubble(newAiId, stoppedText);
        currentSession.messages.push({ role: "ai", content: stoppedText, mode, id: newAiId });
        saveSessions();
      } else {
        document.getElementById(`msgwrap-${newAiId}`)?.remove();
        document.getElementById(`thinkwrap-${newAiId}`)?.remove();
      }
      console.warn("[VX-NET-TIMEOUT] Request Timeout");
      showToast("Request Timeout! Coba Lagi, Tuan", true);
    } else if (err.name === "AbortError") {
      if (lastPartial.trim()) {
        const stoppedText = lastPartial + "\n\n_(Dihentikan Oleh Pengguna)_";
        finalizeBubble(newAiId, stoppedText);
        currentSession.messages.push({ role: "ai", content: stoppedText, mode, id: newAiId });
        saveSessions();
      } else {
        document.getElementById(`msgwrap-${newAiId}`)?.remove();
        document.getElementById(`thinkwrap-${newAiId}`)?.remove();
      }
      showToast("Generate Dihentikan");
    } else {
      document.getElementById(`msgwrap-${newAiId}`)?.remove();
      document.getElementById(`thinkwrap-${newAiId}`)?.remove();
      if (err.vxCode) console.warn(`[${err.vxCode}]`, err.message);
      showToast(friendlyVxMessage(err), true);
    }
  }
  currentAbortController = null;
  isTyping = false; setSendBtnState("send");
  document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
}

// ============ DRAFT AUTO-SAVE ============
function draftKey() { return "vaeltrix_draft_" + (currentSession?.id ?? "newchat"); }
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    const val = document.getElementById("msg-input").value;
    if (val.trim()) localStorage.setItem(draftKey(), val);
    else localStorage.removeItem(draftKey());
  }, 400);
}
function restoreDraft() {
  const input = document.getElementById("msg-input");
  const draft = localStorage.getItem(draftKey());
  input.value = draft || "";
  autoResize(input);
}
function clearDraft() {
  localStorage.removeItem(draftKey());
  localStorage.removeItem("vaeltrix_draft_newchat");
}

// ============ EDIT PESAN USER ============
function startEditMessage(msgId) {
  if (isTyping) { showToast("Tunggu Balasan Vaeltrix Selesai Dulu Ya", true); return; }
  if (isSharedView) return;
  const idx = currentSession?.messages.findIndex(m => m.id === msgId);
  if (idx === undefined || idx === -1) return;
  const msg = currentSession.messages[idx];
  const bubbleEl = document.getElementById(`bubble-${msgId}`);
  const wrapEl = document.getElementById(`msgwrap-${msgId}`);
  if (!bubbleEl || !wrapEl) return;

  bubbleEl.innerHTML = "";
  bubbleEl.classList.add("editing");

  const ta = document.createElement("textarea");
  ta.className = "edit-textarea";
  ta.id = `edit-ta-${msgId}`;
  ta.value = msg.content;
  ta.rows = 1;
  bubbleEl.appendChild(ta);

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "edit-cancel-btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Batal";
  cancelBtn.addEventListener("click", () => renderChat());
  actions.appendChild(cancelBtn);

  const saveBtn = document.createElement("button");
  saveBtn.className = "edit-save-btn";
  saveBtn.type = "button";
  saveBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg> Kirim Ulang`;
  saveBtn.addEventListener("click", () => saveEditedMessage(msgId));
  actions.appendChild(saveBtn);

  bubbleEl.appendChild(actions);

  const oldFooter = wrapEl.querySelector(".bubble-footer");
  if (oldFooter) oldFooter.classList.add("hidden-during-edit");

  const resizeTa = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; };
  resizeTa();
  ta.addEventListener("input", resizeTa);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !isTouchDevice()) { e.preventDefault(); saveEditedMessage(msgId); }
    else if (e.key === "Escape") { e.preventDefault(); renderChat(); }
  });
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

async function saveEditedMessage(msgId) {
  const idx = currentSession?.messages.findIndex(m => m.id === msgId);
  if (idx === undefined || idx === -1) return;
  const ta = document.getElementById(`edit-ta-${msgId}`);
  if (!ta) return;
  const newText = ta.value.trim();
  if (!newText) { showToast("Pesan Tidak Boleh Kosong", true); return; }

  // Edit memotong percakapan dari titik ini — balasan Vaeltrix yang lama jadi tidak relevan lagi
  currentSession.messages = currentSession.messages.slice(0, idx);
  saveSessions();
  renderChat();

  const input = document.getElementById("msg-input");
  input.value = newText;
  autoResize(input);
  await sendMessage();
}

function showLimitBanner() {
  if (document.getElementById("limit-banner")) return;
  document.getElementById("welcome")?.remove();
  const b = document.createElement("div");
  b.className = "limit-banner"; b.id = "limit-banner";
  const sub = isPremium
    ? `Anda Udah Pakai ${PREMIUM_LIMIT} Pesan Premium Jam Ini. Tunggu Reset ${formatResetCountdown()} Buat Lanjut.`
    : `Kamu Udah Pakai ${FREE_LIMIT} Pesan Gratis Jam Ini. Upgrade Ke Premium Buat ${PREMIUM_LIMIT} Pesan/Jam, Atau Tunggu Reset ${formatResetCountdown()}.`;
  b.innerHTML = `<div class="limit-title" style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Limit Pesan ${isPremium ? "Premium" : "Gratis"} Habis</div>
    <div class="limit-sub">${sub}</div>
    ${isPremium ? "" : `<button class="upgrade-btn" onclick="openPremiumModal()" style="display:inline-flex;align-items:center;gap:6px;justify-content:center;"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Upgrade Ke Premium</button>`}`;
  const chat = document.getElementById("chat");
  chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
}


