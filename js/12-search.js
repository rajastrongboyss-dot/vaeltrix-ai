// VaeltrixAI — Web search, deep research, offline mode

// ============ PENCARIAN WEB (Tavily → fallback DuckDuckGo) ============
function isWebSearchEnabled() { return localStorage.getItem("vaeltrix_websearch") === "1"; }
function toggleWebSearch(on) {
  localStorage.setItem("vaeltrix_websearch", on ? "1" : "0");
  showToast(on ? "Pencarian Web Diaktifkan" : "Pencarian Web Dimatikan");
}

// ============ OFFLINE MODE (PREMIUM) ============
// Chat & sesi Vaeltrix sudah tersimpan lokal di device (localStorage). Kalau fitur ini aktif dan
// koneksi internet lagi putus saat kirim pesan, Vaeltrix gak akan gagal/nge-hang — pesan disimpan
// aman dan user ditawarin kirim ulang otomatis begitu koneksi balik.
function isOfflineModeEnabled() { return localStorage.getItem("vaeltrix_offline_mode") === "1"; }
function toggleOfflineMode(el) {
  if (el.checked && !isPremium) {
    el.checked = false;
    closeAttachMenu();
    openPremiumModal();
    return;
  }
  localStorage.setItem("vaeltrix_offline_mode", el.checked ? "1" : "0");
  showToast(el.checked ? "Offline Mode Aktif — Chat Kamu Tetap Aman Walau Tanpa Internet" : "Offline Mode Dimatikan");
}
window.addEventListener("online", () => {
  if (isOfflineModeEnabled() && isPremium) showToast("Internet Kembali — Vaeltrix Siap Lagi, Tuan", false);
});

// ============ DEEP RESEARCH (PREMIUM) ============
function tryDeepResearch() {
  if (!isPremium) { closeAttachMenu(); openPremiumModal(); return; }
  setMode("research");
  closeAttachMenu();
  showToast("Deep Research Aktif — Vaeltrix Analisis Lebih Mendalam");
}

// ============ DEEP RESEARCH PIPELINE (Phase 6) ============
// Sebelumnya "Deep Research" cuma performWebSearch(query, "advanced") SATU KALI -- lebih banyak
// hasil per pencarian, tapi tetap 1 query doang. Persis yang diperingatkan master prompt section
// 16: "jangan membuat Deep Research hanya jadi prompt yang lebih panjang". Di bawah ini pipeline
// yang lebih nyata: Planner (pecah pertanyaan) -> Search Tasks (banyak query paralel) -> Source
// Collection (gabung, dilabel per-query). Synthesis & citation-nya tetap kejadian di system
// prompt existing (07-providers.js) -- itu bagian yang gak saya sentuh/klaim ulang di sini.
// MASIH belum ada tahap Source Evaluation/Cross-check yang EKSPLISIT terpisah (makanya UI-nya
// saya kasih badge "BETA", bukan diklaim penuh) -- itu next step yang jelas kalau mau dilanjut.

async function planResearchQueries(question) {
  // Planner ini manggil AI (lite) buat tugas internal (dekomposisi query) -- BUKAN percakapan
  // yang perlu kelihatan di riwayat user. Kalau lewat jalur backend (Phase 2), tiap panggilan
  // bakal diam-diam bikin 1 "conversation" baru di server (backend belum punya konsep
  // internal/hidden conversation) -- numpuk jadi sampah di sidebar begitu next sync. Daripada
  // itu, planner LLM SENGAJA di-skip kalau backend mode aktif; langsung fallback ke 1 query asli
  // (persis behavior lama, aman, cuma belum dapet upgrade multi-query -- lihat laporan Phase 6).
  if (typeof getVaeltrixBackendToken === "function" && getVaeltrixBackendToken()) {
    return [question];
  }
  try {
    const plannerPrompt = `Pecah pertanyaan riset berikut jadi 2-4 query pencarian web yang lebih spesifik dan saling melengkapi (bahasa sama dengan pertanyaan asli). Balas HANYA array JSON berisi string query, tanpa teks lain, tanpa markdown code fence, tanpa penjelasan.\n\nPertanyaan: "${question}"`;
    const result = await callGemini([{ role: "user", content: plannerPrompt }], "lite", {}, null, null);
    const raw = (typeof result === "string" ? result : result?.text || "").trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/); // toleransi kalau model nyelipin teks di luar array
    const queries = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    if (Array.isArray(queries) && queries.length > 0 && queries.every(q => typeof q === "string" && q.trim())) {
      return queries.slice(0, 4);
    }
  } catch (e) {
    console.warn("VaeltrixAI: planner riset gagal, fallback ke 1 query asli.", e.message || e);
  }
  return [question]; // fallback aman -- persis behavior LAMA (1 search, query apa adanya)
}

async function performDeepResearch(question, onProgress) {
  const queries = await planResearchQueries(question);
  onProgress?.(queries.length > 1 ? `Riset: ${queries.length} Sudut Pencarian...` : "Mencari Di Web...");

  const settled = await Promise.allSettled(queries.map(q => performWebSearch(q, "advanced")));
  const collected = settled
    .map((r, i) => r.status === "fulfilled" ? `## Sumber Untuk: "${queries[i]}"\n${r.value}` : null)
    .filter(Boolean);

  if (collected.length === 0) throw new Error("Semua Pencarian Riset Gagal");
  return collected.join("\n\n");
}

async function tavilySearch(query, depth = "basic") {
  const key = localStorage.getItem("vaeltrix_tavily_key") || TAVILY_KEY;
  if (!key) throw new Error("Tavily Key Kosong");
  // depth "advanced" dipakai khusus mode Research (P0.3) — Tavily beneran ngambil lebih banyak &
  // lebih dalam per query di depth ini (bukan cuma cosmetic), jadi lebih nyambung sama klaim
  // "Deep Research" di system prompt-nya (07-providers.js) yang minta cross-check antar sumber.
  const maxResults = depth === "advanced" ? 8 : 5;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: depth, max_results: maxResults, include_answer: true })
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json();
  let out = "";
  if (data.answer) out += `Ringkasan: ${data.answer}\n\n`;
  (data.results || []).slice(0, maxResults).forEach(r => {
    out += `- ${r.title}: ${(r.content || "").slice(0, 300)} (${r.url})\n`;
  });
  if (!out.trim()) throw new Error("Tavily Respons Kosong");
  return out.trim();
}

async function duckduckgoSearch(query) {
  const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const data = await res.json();
  let out = "";
  if (data.AbstractText) out += `${data.AbstractText} (${data.AbstractURL || ""})\n\n`;
  (data.RelatedTopics || []).slice(0, 5).forEach(t => {
    if (t.Text) out += `- ${t.Text}\n`;
  });
  if (!out.trim()) throw new Error("DuckDuckGo Respons Kosong");
  return out.trim();
}

async function performWebSearch(query, depth = "basic") {
  try {
    return await tavilySearch(query, depth);
  } catch (e) {
    console.warn("Tavily Gagal, Fallback Ke DuckDuckGo:", e.message);
    return await duckduckgoSearch(query); // biarin error-nya nembus kalau ini juga gagal
  }
}


