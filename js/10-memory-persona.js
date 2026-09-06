// VaeltrixAI — Memory & Persona

// ============ VAELTRIX MEMORY ============
function renderMemoryList() {
  const list = document.getElementById("memory-list");
  if (!list) return;
  if (!vMemory.length) { list.innerHTML = `<div class="mem-empty">Belum Ada Yang Diingat. Vaeltrix Bakal Otomatis Nyatet Preferensi Kamu Dari Obrolan.</div>`; return; }
  list.innerHTML = vMemory.map((m, i) => `<div class="mem-item"><span>${escHtml(m)}</span><button onclick="deleteMemoryItem(${i})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join("");
}
function deleteMemoryItem(i) {
  vMemory.splice(i, 1);
  safeStorageSet("vaeltrix_memory", vMemory);
  renderMemoryList();
}
function clearMemory() {
  vMemory = [];
  safeStorageSet("vaeltrix_memory", vMemory);
  renderMemoryList();
  showToast("Memory Vaeltrix Dikosongkan.");
}
function addMemoryFacts(facts) {
  if (!isMemoryAutoSaveOn()) return; // Settings > Memory Space > Auto-Save Off
  facts.forEach(f => {
    f = f.trim().replace(/^[-*]\s*/, "");
    if (f.length < 3 || f.length > 140) return;
    if (/^(none|tidak ada|nothing)$/i.test(f)) return;
    if (!vMemory.some(existing => existing.toLowerCase() === f.toLowerCase())) vMemory.push(f);
  });
  if (vMemory.length > 15) vMemory = vMemory.slice(vMemory.length - 15);
  safeStorageSet("vaeltrix_memory", vMemory);
  renderMemoryList();
}
// Ekstraksi memory ringan di background pakai model tercepat — tidak mengganggu chat utama
// Section 15 brief: "Jangan melakukan memory extraction untuk setiap pesan kecil secara otomatis
// jika tidak diperlukan. Gunakan signal-based extraction." — sebelumnya SETIAP pesan user (≥8
// karakter) manggil AI extractor, walau isinya pertanyaan teknis biasa yang jelas gak ada fakta
// personal apapun buat diinget. Sekarang dicek LOKAL dulu (regex, gratis+instan, gak ada network
// call) — AI extractor cuma dipanggil kalau ada sinyal yang PLAUSIBLE ngandung fakta permanen.
const MEMORY_SIGNAL_PATTERNS = [
  /\bnama\s*(saya|aku|gue|gw)\b/i, /\b(saya|aku|gue|gw)\s*(suka|tidak\s*suka|gak\s*suka|nggak\s*suka|benci)\b/i,
  /\bpreferensi\s*(saya|aku)\b/i, /\bingat(lah)?\s*(bahwa|kalau|ya)\b/i, /\bmulai\s*sekarang\b/i,
  /\b(saya|aku|gue|gw)\s*(kerja|bekerja)\s*(di|sebagai)\b/i, /\b(saya|aku|gue|gw)\s*tinggal\s*di\b/i,
  /\btolong\s*(ingat|inget)\b/i, /\bpanggil\s*(saya|aku)\b/i, /\bumur\s*(saya|aku)\b/i,
  /\b(saya|aku|gue|gw)\s*(punya|adalah|merupakan)\b/i,
];
function hasMemorySignal(text) { return MEMORY_SIGNAL_PATTERNS.some(p => p.test(text)); }

async function updateMemoryFromMessage(userText) {
  if (!userText || userText.length < 8) return;
  if (!hasMemorySignal(userText)) return; // gak ada sinyal -> skip, gak usah panggil AI sama sekali
  // Phase 4 fix: sebelumnya raw fetch(GROQ_BASE) di sini — sekarang lewat callUtilityModel()
  // (07-providers.js), dapet timeout+fallback provider otomatis, dan gagal dengan aman (memory
  // best-effort, chat utama TETAP jalan normal walau ini gagal — section 46 brief).
  const result = await callUtilityModel(
    "Ekstrak fakta/preferensi PERMANEN tentang user (nama, pekerjaan, hobi, gaya bahasa yang disuka, dll) dari 1 pesan berikut. Balas HANYA daftar singkat pakai tanda '-' per baris, maksimal 2 baris, bahasa Indonesia. Kalau tidak ada fakta permanen yang layak diingat, balas persis: NONE.",
    userText.slice(0, 500),
    { maxTokens: 80, temperature: 0.2 }
  );
  if (!result) return;
  if (!result.text || /NONE/i.test(result.text.trim())) return;
  const facts = result.text.split("\n").filter(l => l.trim().startsWith("-"));
  if (facts.length) addMemoryFacts(facts);
}


// ============ PERSONA / GAYA BICARA ============
const PERSONA_PRESETS = [
  { key: "default", label: "Default", desc: "Gaya Bawaan Vaeltrix, Panggil \"Tuan\"", addon: "" },
  { key: "formal", label: "Formal", desc: "Bahasa Baku, Sopan, Profesional", addon: "\n\nGAYA BICARA TAMBAHAN: Gunakan Bahasa Indonesia baku dan formal, hindari singkatan gaul, tetap sopan dan profesional seperti komunikasi bisnis." },
  { key: "santai", label: "Santai", desc: "Gaul, Ringan, Kayak Ngobrol Sama Temen", addon: "\n\nGAYA BICARA TAMBAHAN: Ngobrol santai kayak sama temen deket, boleh pakai bahasa gaul sehari-hari, tetap jelas dan gak bertele-tele." },
  { key: "guru", label: "Guru", desc: "Sabar, Step-By-Step, Banyak Contoh", addon: "\n\nGAYA BICARA TAMBAHAN: Jelaskan seperti guru yang sabar — pecah jadi langkah-langkah kecil, kasih contoh konkret, dan cek pemahaman di akhir." },
  { key: "singkat", label: "Ringkas", desc: "To The Point, Tanpa Basa-Basi", addon: "\n\nGAYA BICARA TAMBAHAN: Jawab singkat dan to the point, hindari basa-basi panjang, langsung ke inti jawaban." },
];

function getSelectedPersona() {
  const key = localStorage.getItem("vaeltrix_persona") || "default";
  return PERSONA_PRESETS.find(p => p.key === key) || PERSONA_PRESETS[0];
}

function renderPersonaList() {
  const wrap = document.getElementById("persona-list");
  if (!wrap) return;
  const active = getSelectedPersona().key;
  wrap.innerHTML = PERSONA_PRESETS.map(p => `
    <button class="panel-btn${p.key === active ? " blue" : ""}" style="text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:2px;${p.key === active ? "" : "background:rgba(255,255,255,0.02);"}" onclick="selectPersona('${p.key}')">
      <span style="display:flex;align-items:center;gap:6px;font-weight:600;">${p.key === active ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ""}${escHtml(p.label)}</span>
      <span style="font-size:10.5px;color:var(--muted);font-weight:400;">${escHtml(p.desc)}</span>
    </button>
  `).join("");
}

function selectPersona(key) {
  localStorage.setItem("vaeltrix_persona", key);
  renderPersonaList();
  showToast(`Gaya Bicara Diganti Ke "${PERSONA_PRESETS.find(p=>p.key===key)?.label}"`);
}


