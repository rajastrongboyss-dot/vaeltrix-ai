// VaeltrixAI — 18-cloud-sync.js
// ================================================================
// Phase 3 (Account + Cloud Sync) — LANJUTAN dari 17-account.js: sinkron daftar
// percakapan dari backend VaeltrixLabs ke sidebar lokal.
// ================================================================
// Model yang dipakai: ADDITIVE, bukan replace. Sesi lokal (localStorage/IndexedDB, `sessions`
// array dari 05-sidebar.js) TETAP source of truth buat sesi yang dibuat SEBELUM/TANPA login.
// Begitu login, percakapan dari backend ditambahin ke `sessions` yang SAMA sebagai entri baru
// (ditandai `remoteOnly:true` sampai isinya beneran ditarik) -- jadi seluruh mesin render/simpan/
// hapus yang sudah ada di 05-sidebar.js otomatis kepakai lagi, TANPA sistem storage kedua.
//
// BELUM dikerjakan di sini (masih scope lanjutan):
//   - Upload sesi LOKAL lama (yang dibuat sebelum pernah login) ke backend -- itu "migration"
//     beneran (section 36), butuh keputusan produk sendiri (auto-upload semua? tanya user dulu?
//     assign ke conversation baru per sesi?). Di sini CUMA arah DOWNLOAD (backend -> lokal).
//   - Rename judul sesi ikut sync ke backend (belum ada endpoint PATCH conversation di backend).
//   - Realtime/multi-tab sync -- ini cuma sync SEKALI pas login/refresh token, bukan polling terus.

// Mode (UI) -> modelId backend sudah ada di 07-providers.js (MODE_TO_BACKEND_MODEL_ID). Ini
// kebalikannya (modelId -> mode), buat nampilin badge mode yang masuk akal di sidebar utk
// percakapan yang datang dari backend.
function mapBackendModelIdToMode(modelId) {
  const entry = Object.entries(typeof MODE_TO_BACKEND_MODEL_ID !== "undefined" ? MODE_TO_BACKEND_MODEL_ID : {})
    .find(([, id]) => id === modelId);
  return entry ? entry[0] : "flash";
}

// Dipanggil dari 17-account.js begitu login/refresh berhasil.
async function vaeltrixSyncConversationList() {
  if (typeof isVaeltrixLoggedIn !== "function" || !isVaeltrixLoggedIn()) return;
  if (typeof sessions === "undefined") return; // jaga-jaga kalau script order suatu saat berubah

  try {
    const existingBackendIds = new Set(sessions.filter(s => s.backendConversationId).map(s => s.backendConversationId));
    const newOnes = [];

    // Section 21 fix: SEBELUMNYA cuma fetch SEKALI (?limit=50) -- user dengan
    // >50 percakapan ter-sync gak bakal keambil semuanya pas login di device
    // baru, sisanya ilang gitu aja tanpa pemberitahuan. Sekarang looping pakai
    // cursor sampai backend bilang gak ada halaman lagi (nextCursor null).
    // MAX_PAGES cuma jaga-jaga (maks 1000 percakapan sekali sync) -- bukan
    // batas yang realistis kepakai user normal.
    const MAX_PAGES = 20;
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = cursor ? `/conversations?limit=50&cursor=${encodeURIComponent(cursor)}` : "/conversations?limit=50";
      const data = await vaeltrixApiFetch(query);

      for (const conv of (data.items || [])) {
        if (existingBackendIds.has(conv.id)) continue; // sudah ada lokal (mis. dibuat di sesi ini juga), skip
        newOnes.push({
          id: `remote-${conv.id}`,
          title: conv.title || "Percakapan",
          messages: [], // kosong dulu -- ditarik pas user beneran buka (lihat hook di loadSession)
          mode: mapBackendModelIdToMode(conv.modelId),
          backendConversationId: conv.id,
          remoteOnly: true,
          updatedAt: conv.updatedAt
        });
      }

      cursor = data.nextCursor;
      if (!cursor) break;
    }

    if (newOnes.length > 0) {
      // Sesi LOKAL yang sudah ada TIDAK PERNAH punya field updatedAt (lihat newChat() di
      // 05-sidebar.js) -- nyortir SELURUH `sessions` pakai updatedAt bakal nganggep semua sesi
      // lokal itu "updatedAt=1970" dan ndorong ke paling bawah, ngerusak urutan asli user. Jadi
      // di sini CUMA nyortir sesi BARU dari backend di antara sesama mereka sendiri (yang emang
      // punya updatedAt asli), lalu ditaruh di ATAS -- urutan sesi lokal lain sama sekali gak disentuh.
      newOnes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      sessions.unshift(...newOnes);
      saveSessions();
      if (typeof renderHistory === "function") renderHistory();
    }
  } catch (e) {
    // Gagal sync bukan hal fatal -- sidebar lokal tetap kepakai apa adanya, cuma gak ke-update.
    console.warn("VaeltrixAI: Gagal Sync Daftar Percakapan Dari Backend.", e);
  }
}

// Dipanggil dari hook di loadSession() (05-sidebar.js) begitu sesi yang dibuka masih "remoteOnly".
async function vaeltrixHydrateRemoteSession(localId) {
  const session = sessions.find(s => s.id === localId);
  if (!session || !session.remoteOnly) return;

  try {
    const data = await vaeltrixApiFetch(`/conversations/${session.backendConversationId}`);
    session.messages = (data.conversation.messages || []).map(m => ({
      role: m.role === "user" ? "user" : "ai", // backend: user/assistant/system/tool -> frontend: user/ai
      content: m.content,
      mode: mapBackendModelIdToMode(m.model),
      id: m.id
    }));
    session.remoteOnly = false;
    saveSessions();
    // User bisa aja udah pindah ke sesi lain sebelum fetch ini selesai -- cuma render ulang
    // kalau sesi yang lagi aktif SEKARANG masih sesi yang sama ini.
    if (typeof currentSession !== "undefined" && currentSession?.id === localId && typeof renderChat === "function") {
      renderChat();
    }
  } catch (e) {
    console.warn("VaeltrixAI: Gagal Ambil Isi Percakapan Dari Database.", e);
    if (typeof showToast === "function") showToast("Gagal Memuat Percakapan Dari Server", true);
  }
}

// Dipanggil dari 17-account.js begitu login/refresh berhasil. Sesi lokal, bukan sistem
// storage kedua -- sama filosofinya kayak vaeltrixSyncConversationList() di atas.
async function vaeltrixSyncProjectList() {
  if (typeof isVaeltrixLoggedIn !== "function" || !isVaeltrixLoggedIn()) return;
  if (typeof projects === "undefined") return;

  try {
    const data = await vaeltrixApiFetch("/projects?limit=50");
    const existingBackendIds = new Set(projects.filter(p => p.backendProjectId).map(p => p.backendProjectId));
    let addedAny = false;

    for (const proj of (data.items || [])) {
      if (existingBackendIds.has(proj.id)) continue;
      projects.push({
        id: `remote-${proj.id}`,
        name: proj.name,
        instructions: "", // ditarik pas beneran dibuka, lihat vaeltrixHydrateRemoteProject
        files: [], // file referensi belum ada versi backend-nya (lihat laporan Phase 4)
        createdAt: new Date(proj.createdAt).getTime(),
        backendProjectId: proj.id,
        remoteOnly: true
      });
      addedAny = true;
    }

    if (addedAny) {
      saveProjects();
      if (typeof renderProjectsList === "function") renderProjectsList();
    }
  } catch (e) {
    console.warn("VaeltrixAI: Gagal Sync Daftar Project Dari Backend.", e);
  }
}

// Dipanggil dari hook di openProjectDetail() (14-projects.js) begitu project yang dibuka masih
// "remoteOnly" (instruksi lengkapnya belum ditarik).
async function vaeltrixHydrateRemoteProject(localId) {
  const proj = projects.find(p => p.id === localId);
  if (!proj || !proj.remoteOnly) return;

  try {
    const data = await vaeltrixApiFetch(`/projects/${proj.backendProjectId}`);
    proj.instructions = data.project.instructions || "";
    proj.remoteOnly = false;
    saveProjects();
    // User bisa aja udah pindah dari detail project ini sebelum fetch selesai -- cuma update
    // kotak instruksi kalau project ini masih yang lagi kebuka SEKARANG.
    if (typeof projectDetailId !== "undefined" && projectDetailId === localId) {
      const input = document.getElementById("project-instructions-input");
      if (input) input.value = proj.instructions;
    }
  } catch (e) {
    console.warn("VaeltrixAI: Gagal Ambil Detail Project Dari Backend.", e);
    if (typeof showToast === "function") showToast("Gagal Memuat Detail Project Dari Server", true);
  }
}

// Dipanggil dari hook di deleteSession() (05-sidebar.js). Fire-and-forget dgn sengaja -- UI lokal
// udah kehapus duluan di pemanggil, ini cuma nyusul di background, gagal cukup di-log.
function vaeltrixDeleteRemoteConversation(backendConversationId) {
  vaeltrixApiFetch(`/conversations/${backendConversationId}`, { method: "DELETE" })
    .catch(e => console.warn("VaeltrixAI: Gagal Hapus Percakapan Di Backend (Tetap Kehapus Lokal).", e));
}

// ---- Upload data lokal LAMA (dibuat sebelum pernah login) -- arah sebaliknya dari sync di atas.
// Beda dari sync (yang otomatis jalan sendiri pas login), ini SENGAJA cuma jalan kalau user
// nge-klik tombolnya sendiri (lihat account-modal di index.html) -- bukan keputusan yang aman
// diambil diam-diam buat user, sesuai catatan "belum dikerjakan" di laporan Phase 3b/4b. ----

function vaeltrixCountUnsyncedLocal() {
  if (typeof sessions === "undefined" || typeof projects === "undefined") return 0;
  const unsyncedSessions = sessions.filter(s => !s.backendConversationId && !s.remoteOnly && s.messages?.some(m => !m.pending && m.content)).length;
  const unsyncedProjects = projects.filter(p => !p.backendProjectId && !p.remoteOnly).length;
  return unsyncedSessions + unsyncedProjects;
}

async function vaeltrixUploadLocalData(onProgress) {
  if (typeof isVaeltrixLoggedIn !== "function" || !isVaeltrixLoggedIn()) return { uploaded: 0, failed: 0 };
  let uploaded = 0, failed = 0;

  // Project diupload DULUAN, biar sesi yang nyambung ke situ bisa ke-link projectId backend-nya
  // yang bener pas giliran sesi diupload di bawah.
  const localProjects = projects.filter(p => !p.backendProjectId && !p.remoteOnly);
  for (const proj of localProjects) {
    try {
      const data = await vaeltrixApiFetch("/projects", { method: "POST", body: { name: proj.name, instructions: proj.instructions || undefined } });
      proj.backendProjectId = data.project.id;
      saveProjects(); // simpen SEKARANG, bukan nunggu akhir loop -- kalau upload keputus di
      // tengah jalan, project yang udah berhasil gak ke-upload dobel pas dicoba lagi
      uploaded++;
    } catch (e) {
      failed++;
      console.warn("VaeltrixAI: Gagal Upload Project Lama:", proj.name, e);
    }
    onProgress?.();
  }

  const localSessions = sessions.filter(s => !s.backendConversationId && !s.remoteOnly && s.messages?.some(m => !m.pending && m.content));
  for (const s of localSessions) {
    try {
      const modelId = (typeof MODE_TO_BACKEND_MODEL_ID !== "undefined" ? MODE_TO_BACKEND_MODEL_ID[s.mode] : null) || "vaeltrix-flash";
      const linkedProject = s.projectId ? projects.find(p => p.id === s.projectId) : null;
      const payload = {
        title: s.title,
        modelId,
        projectId: linkedProject?.backendProjectId || undefined,
        messages: s.messages
          .filter(m => !m.pending && m.content)
          .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }))
      };
      if (payload.messages.length === 0) { onProgress?.(); continue; }
      const data = await vaeltrixApiFetch("/conversations/import", { method: "POST", body: payload });
      s.backendConversationId = data.conversation.id;
      saveSessions(); // sama alasannya kayak project di atas -- simpen per-item, bukan di akhir
      uploaded++;
    } catch (e) {
      failed++;
      console.warn("VaeltrixAI: Gagal Upload Sesi Lama:", s.title, e);
    }
    onProgress?.();
  }

  return { uploaded, failed };
}

// ============ SYNC SETTINGS LINTAS DEVICE ============
// Whitelist SENGAJA eksplisit -- JANGAN pernah tambah API key BYOK
// (vaeltrix_user_key, vaeltrix_groq_key, vaeltrix_openrouter_key,
// vaeltrix_pollinations_key, vaeltrix_tavily_key, vaeltrix_elevenlabs_key) ke
// sini. Key-key itu tetap cuma di device, gak pernah dikirim ke backend.
const SYNCABLE_SETTINGS_KEYS = [
  "vaeltrix_theme", "vaeltrix_font_size", "vaeltrix_language", "vaeltrix_effort",
  "vaeltrix_force_thinking", "vaeltrix_voice_provider", "vaeltrix_voice_uri",
  "vaeltrix_memory_autosave", "vaeltrix_persona", "vaeltrix_beta",
];

// Dipanggil pas settings modal ditutup (04-settings.js: closeSettingsModal()) --
// kirim snapshot lengkap value SAAT INI, backend REPLACE penuh (bukan merge).
async function vaeltrixSyncSettingsToCloud() {
  if (typeof isVaeltrixLoggedIn !== "function" || !isVaeltrixLoggedIn()) return;
  try {
    const snapshot = {};
    for (const key of SYNCABLE_SETTINGS_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) snapshot[key] = val;
    }
    await vaeltrixApiFetch("/settings", { method: "PATCH", body: { settings: snapshot } });
  } catch (e) {
    console.warn("VaeltrixAI: Gagal Sync Settings Ke Cloud:", e);
  }
}

// Dipanggil sekali abis login/refresh berhasil (17-account.js:
// startVaeltrixRefreshTimer()). SENGAJA cuma nulis ke localStorage, GAK
// langsung nge-apply ke variabel/UI yang lagi jalan sekarang -- banyak setting
// di atas baru kebaca ulang pas load berikutnya, coba "apply live" tanpa tau
// persis efek samping tiap satu (theme/persona/dst) risikonya lebih gede
// daripada manfaatnya. Reload cukup buat liat hasilnya, dan itu wajar buat
// fitur sync lintas device kayak gini.
async function vaeltrixSyncSettingsFromCloud() {
  try {
    const data = await vaeltrixApiFetch("/settings");
    const remote = data.settings || {};
    let changed = false;
    for (const key of SYNCABLE_SETTINGS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(remote, key) && localStorage.getItem(key) !== remote[key]) {
        localStorage.setItem(key, remote[key]);
        changed = true;
      }
    }
    if (changed && typeof showToast === "function") {
      showToast("Pengaturan Dari Perangkat Lain Diterapkan. Refresh Untuk Melihat.");
    }
  } catch (e) {
    console.warn("VaeltrixAI: Gagal Ambil Settings Dari Cloud:", e);
  }
}
