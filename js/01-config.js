function safeJsonParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (fallback !== null && typeof fallback === "object" && !Array.isArray(fallback) &&
        (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) return fallback;
    return parsed;
  } catch (e) {
    console.warn("[VX-STORAGE-CORRUPT] Gagal parse JSON, pakai fallback default:", e.message);
    return fallback;
  }
}

function safeStorageGet(key, fallback) {
  try {
    return safeJsonParse(localStorage.getItem(key), fallback);
  } catch (e) {
    console.warn(`[VX-STORAGE-001] localStorage.getItem("${key}") gagal:`, e.message);
    return fallback;
  }
}
function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[VX-STORAGE-QUOTA] localStorage.setItem("${key}") gagal:`, e.message);
    return false;
  }
}
function safeStorageRemove(key) {
  try { localStorage.removeItem(key); return true; }
  catch (e) { console.warn(`[VX-STORAGE-001] localStorage.removeItem("${key}") gagal:`, e.message); return false; }
}

// Section 4-9 master prompt: SEBELUMNYA 3 baris di bawah ini isinya key asli VaeltrixLabs
// (Gemini x2 + Groq) yang ketauan ke-expose ke browser -- siapa aja bisa buka DevTools/View
// Source dan pakein key itu di luar app ini sepenuhnya, tanpa rate limit/kuota apapun (browser
// manggil provider LANGSUNG, gak lewat backend sama sekali). Sekarang SENGAJA dikosongin dan
// TIDAK diisi ulang -- key VaeltrixLabs yang lama itu udah dianggap bocor & wajib dirotasi di
// dashboard provider, BUKAN ditaruh lagi di sini. Efeknya: guest/BYOK yang belum isi key sendiri
// bakal dapet pesan "API key belum diatur" yang SUDAH ada (lihat callGroq/callGeminiAPI di
// 07-providers.js) alih-alih diam-diam kepakein key platform -- login lewat /login buat jalur
// backend (ada kuota gratis resmi + gak butuh key sendiri), atau isi API key sendiri di
// Settings > Custom API Keys.
const DEFAULT_KEY = "";
const DEFAULT_KEY2 = "";
const GROQ_KEY = "";
const _k = 42;
const _ec = [[42, 120, 111, 100, 112, 18, 29], [126, 82, 80, 80, 120, 79, 27, 19]];
const PREMIUM_CODES = _ec.map(e => e.map(c => String.fromCharCode(c ^ _k)).join(''));
const FREE_LIMIT = 20;
const PREMIUM_LIMIT = 60;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
const VAELTRIX_BACKEND_BASE = "https://vaeltrix-ai-production.up.railway.app";
const POLLINATIONS_EDIT_BASE = "https://gen.pollinations.ai/v1/images/edits";
// Sama kayak DEFAULT_KEY/GROQ_KEY di atas -- key Tavily VaeltrixLabs yang lama ke-expose ke
// browser (dan bahkan gak pernah ada di config backend sama sekali, jadi search 100% jalan di
// frontend). Dikosongin, jangan diisi ulang. tavilySearch() (12-search.js) SUDAH otomatis fallback
// ke DuckDuckGo (keyless, gratis) kalau key ini kosong -- search tetap jalan, cuma kualitasnya
// turun buat guest/BYOK yang belum isi Tavily key sendiri.
const TAVILY_KEY = "";
const ELEVENLABS_TTS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_MODEL = "eleven_flash_v2_5";
const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "f", desc: "Tenang & Natural — Cocok Buat Narasi" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  gender: "f", desc: "Lembut & Hangat" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",   gender: "f", desc: "Ekspresif & Ceria" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",   gender: "m", desc: "Dalam & Berwibawa" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "m", desc: "Profesional & Ramah" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",   gender: "m", desc: "Tegas & Meyakinkan" },
];

const MODELS = {
  flash:  { api: "gemini", models: ["gemini-3.6-flash"] },
  lite: { api: "groq", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  code:    { api: "gemini", models: ["gemini-3.1-pro", "gemini-3.6-flash"] },
  maxs:    { api: "gemini", models: ["gemini-3.1-pro-preview", "gemini-3.1-pro", "gemini-3.6-flash"] },
  research: { api: "gemini", models: ["gemini-3.1-pro-preview", "gemini-3.1-pro", "gemini-3.6-flash"] },
  offline: { api: "webllm", models: ["Llama-3.2-3B-Instruct-q4f16_1-MLC"] }
};

const MODEL_ENDPOINTS = {
  "gemini-3.6-flash":        { provider: "gemini", endpoint: GEMINI_BASE, maxTokens: 9281 },
  "gemini-3.1-pro":          { provider: "gemini", endpoint: GEMINI_BASE, maxTokens: 9282 },
  "gemini-3.1-pro-preview":  { provider: "gemini", endpoint: GEMINI_BASE, maxTokens: 9281 },
  "openai/gpt-oss-120b":     { provider: "groq",   endpoint: GROQ_BASE,   maxTokens: 4096 },
  "openai/gpt-oss-20b":      { provider: "groq",   endpoint: GROQ_BASE,   maxTokens: 4096 },
};

const VISION_MODEL = "qwen/qwen3.6-27b";

const MODEL_CAPABILITIES = {
  "gemini-3.6-flash":       { speedTier: "fast",     reasoningSupport: true, coding: "medium", freeTier: true  },
  "gemini-3.1-pro":         { speedTier: "standard", reasoningSupport: true, coding: "strong",  freeTier: false },
  "gemini-3.1-pro-preview": { speedTier: "standard", reasoningSupport: true, coding: "strong",  freeTier: false },
  "openai/gpt-oss-120b":    { speedTier: "fast",     reasoningSupport: true, coding: "strong",  freeTier: true  },
  "openai/gpt-oss-20b":     { speedTier: "fast",     reasoningSupport: true, coding: "medium",  freeTier: true  },
  "Llama-3.2-3B-Instruct-q4f16_1-MLC": { speedTier: "fast", reasoningSupport: false, coding: "weak", freeTier: true },
};

function getModelCapability(model) {
  return MODEL_CAPABILITIES[model] || { speedTier: "standard", reasoningSupport: false, coding: "unknown", freeTier: false };
}

// ============ QUICK PROMPTS ============
const QUICK_PROMPTS = [
  { icon: "email", title: "Draft Email", desc: "Bikinin Email Profesional Buat...", text: "Tolong bikinin draft email profesional untuk: " },
  { icon: "cv", title: "Bikin CV / Resume", desc: "Susun CV Rapi Berdasarkan Pengalaman Kamu", text: "Bantu saya bikin CV/resume rapi berdasarkan pengalaman ini: " },
  { icon: "translate", title: "Translate Teks", desc: "Terjemahin Teks Ke Bahasa Lain", text: "Tolong terjemahkan teks berikut ke Bahasa Inggris: " },
  { icon: "summary", title: "Ringkas Teks", desc: "Rangkum Artikel/Dokumen Panjang", text: "Tolong ringkas teks berikut jadi poin-poin penting: " },
  { icon: "idea", title: "Ide Konten", desc: "Cariin Ide Konten Yang Menarik", text: "Kasih saya 10 ide konten menarik tentang: " },
  { icon: "code", title: "Review Kode", desc: "Cek Bug & Kasih Saran Perbaikan", text: "Tolong review kode berikut, cari bug dan kasih saran perbaikan:\n\n" },
];

// ============ STATE ============
let sessions    = safeStorageGet("vaeltrix_sessions", []);
let currentSession = null;
let currentMode = "flash";
let vaeltrixFolders = safeStorageGet("vaeltrix_folders", []);
let folderPickerTargetId = null;
function saveFolders() { safeStorageSet("vaeltrix_folders", vaeltrixFolders); }
let freeCount   = parseInt(localStorage.getItem("vaeltrix_free_count") || "0");
let isTyping    = false;
let imageGenMode = false; // Mode "Buat Photo" — pesan berikutnya jadi prompt generate gambar (Pollinations)
let imageEditMode = false; // Mode "Edit Foto" — pesan berikutnya jadi instruksi edit buat gambar yang udah dilampirkan
let currentAbortController = null;
let draftSaveTimer = null;

// Vaeltrix Memory — inget preferensi/konteks user lintas sesi
let vMemory = safeStorageGet("vaeltrix_memory", []);

// Vaeltrix Stats
let vStats = safeStorageGet("vaeltrix_stats", {"totalChats":0,"totalMsgs":0,"modeUsage":{"flash":0,"lite":0,"code":0,"maxs":0,"research":0,"offline":0}});

// Feedback thumbs up/down (per message id)
let vFeedback = safeStorageGet("vaeltrix_feedback", {});

// Referral
let referralCode = localStorage.getItem("vaeltrix_referral_code");
let trialExpiry  = parseInt(localStorage.getItem("vaeltrix_trial_expiry") || "0");

// Free tier reset (usage-based)
let resetAt = parseInt(localStorage.getItem("vaeltrix_reset_at") || "0");
let resetTimerHandle = null;

// Attachments (Vaeltrix Vision / File Upload)
let pendingAttachments = []; // { name, type, dataUrl?, textContent?, isImage }

// Voice
let recognition = null;
let isRecording = false;
let currentSpeakUtterance = null;
let currentElevenAudio = null; // <audio> yang lagi diputer pas Play Voice pakai provider ElevenLabs

const ARTIFACT_MIN_LEN = 180;

// Vaeltrix Projects/Workspace — grup chat + instruksi khusus + file referensi
let projects = safeStorageGet("vaeltrix_projects", []);
let projectDetailId = null; // project yang lagi kebuka detailnya di panel

// Vaeltrix Live — voice mode dua arah (dengar -> jawab -> ngomong -> ulang)
let liveModeOpen = false;
let liveRecognition = null;
let liveState = "idle"; // idle | listening | thinking | speaking
let liveMuted = false;
let liveStopRequested = false;
let liveConsecutiveFails = 0; // hitungan gagal beruntun (buat cegah loop restart tanpa henti)
let liveRestartTimer = null;

// Shared/read-only mode
let isSharedView = false;

// Premium = kode aktivasi permanen ATAU lagi dalam masa trial referral
function isPremiumActive() {
  if (localStorage.getItem("vaeltrix_premium") === "true") return true;
  return trialExpiry > Date.now();
}

let isPremium = isPremiumActive();
