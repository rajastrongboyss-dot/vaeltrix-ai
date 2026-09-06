// VaeltrixAI — Settings: theme/font/lang, API keys, premium, plan UI, free-tier reset

// ================================================================
// ============================ SETTINGS =========================
// (Profile, AI Model, Account Security/PIN, Feedback, Memory Space,
//  Play Voice, Theme, Font Size, Language, Feature Management,
//  Notification Settings, About & Check for Updates)
// ================================================================

// ---- Profile ----
function getProfile() {
  return safeStorageGet("vaeltrix_profile", { name: "Vaeltrix User", email: "", username: "", photo: "" });
}
function saveProfileData(p) {
  safeStorageSet("vaeltrix_profile", p);
  updateProfileUI();
}
function updateProfileUI() {
  const p = getProfile();
  const nameEl = document.getElementById("settings-profile-name");
  const emailEl = document.getElementById("settings-profile-email");
  const avatarEl = document.getElementById("settings-avatar-initial");
  const displayName = p.name || "Vaeltrix User";
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = (p.username ? "@" + p.username : "") || p.email || "Belum Ada Email Tersimpan";
  if (avatarEl) {
    if (p.photo) {
      avatarEl.innerHTML = `<img src="${p.photo}" alt="Foto Profil">`;
    } else {
      avatarEl.textContent = (displayName.trim().charAt(0) || "V").toUpperCase();
    }
  }
}

// ---- Edit Profile Sheet ----
let editProfilePendingPhoto = null;
function openEditProfileModal() {
  const p = getProfile();
  editProfilePendingPhoto = p.photo || null;
  document.getElementById("edit-profile-name-input").value = p.name || "";
  document.getElementById("edit-profile-username-input").value = p.username || "";
  renderEditProfileAvatar(p.photo, p.name);
  document.getElementById("edit-profile-backdrop").classList.add("show");
}
function closeEditProfileModal() {
  document.getElementById("edit-profile-backdrop").classList.remove("show");
}
function renderEditProfileAvatar(photo, name) {
  const el = document.getElementById("edit-profile-avatar-preview");
  if (!el) return;
  if (photo) el.innerHTML = `<img src="${photo}" alt="Foto Profil">`;
  else el.textContent = ((name || "V").trim().charAt(0) || "V").toUpperCase();
}
async function handleProfilePhotoSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await readAsDataURL(file);
    editProfilePendingPhoto = dataUrl;
    renderEditProfileAvatar(dataUrl, null);
  } catch (e) { showToast("Gagal Memuat Foto", true); }
  event.target.value = "";
}
function saveProfile() {
  const name = document.getElementById("edit-profile-name-input").value.trim();
  const username = document.getElementById("edit-profile-username-input").value.trim().replace(/\s+/g, "");
  if (!name) { showToast("Nama Tidak Boleh Kosong", true); return; }
  const p = getProfile();
  p.name = name;
  p.username = username;
  if (editProfilePendingPhoto !== null) p.photo = editProfilePendingPhoto;
  saveProfileData(p);
  closeEditProfileModal();
  showToast("Profil Tersimpan");

  // Dorong ke akun backend juga kalau lagi login -- foto & username TETAP
  // lokal-only (gak ada kolomnya di backend), cuma "name" yang disamain.
  if (typeof isVaeltrixLoggedIn === "function" && isVaeltrixLoggedIn() && typeof vaeltrixApiFetch === "function") {
    vaeltrixApiFetch("/account/profile", { method: "PATCH", body: { name } })
      .then(() => { if (vxUser) vxUser.name = name; })
      .catch((e) => console.warn("VaeltrixAI: Gagal Sync Nama Ke Akun:", e));
  }
}

// ---- AI Model label ----
function getModeDisplayName(mode) {
  const names = { flash: "Vaeltrix Flash", lite: "Vaeltrix Lite", code: "Vaeltrix Code", maxs: "Vaeltrix Maxs", research: "Vaeltrix Deep Research" };
  return names[mode] || "Vaeltrix Flash";
}

// ---- Settings Sheet ----
function openSettingsModal() {
  document.getElementById("more-menu")?.classList.remove("open");
  if (!isDesktopLayout()) closeSidebar();
  updateProfileUI();
  document.getElementById("settings-val-model").textContent = getModeDisplayName(currentMode);
  document.getElementById("settings-val-security").textContent = hasPinSet() ? "PIN Aktif" : "Standard";
  document.getElementById("settings-val-memory").textContent = isMemoryAutoSaveOn() ? "Auto-Save On" : "Auto-Save Off";
  document.getElementById("settings-val-voice").textContent = getVoiceLabel();
  document.getElementById("settings-val-theme").textContent = getThemeLabel();
  document.getElementById("settings-val-font").textContent = getFontSizeLabel();
  document.getElementById("settings-val-effort").textContent = getEffortLabel();
  document.getElementById("settings-val-lang").textContent = getLanguage() === "en" ? "English" : "Indonesia";
  document.getElementById("settings-val-beta").textContent = isBetaEnabled() ? "Beta On" : "Beta Off";
  document.getElementById("settings-val-notif").textContent = isNotifEnabled() ? "On" : "Off";
  document.getElementById("settings-backdrop").classList.add("show");
}
function closeSettingsModal() {
  document.getElementById("settings-backdrop").classList.remove("show");
  if (typeof vaeltrixSyncSettingsToCloud === "function") vaeltrixSyncSettingsToCloud();
}

// ---- Account Security (App Lock PIN, lokal di device) ----
// v1.8.0 Phase 3: PIN sekarang di-hash (SHA-256 + salt per-install) pakai Web Crypto API bawaan
// browser — BUKAN nambah library baru (rule 11 brief: no big dependency kalau native udah cukup).
//
// CATATAN JUJUR soal batasan: PIN 4-6 digit itu cuma py 10.000-1.000.000 kombinasi — hashing GAK
// bikin PIN ini "gak bisa dibobol" kalau seseorang akses langsung ke storage device secara offline
// (nyoba semua kombinasi ke hash yang ke-tangkep itu instan buat komputer manapun, salt atau
// enggak). Manfaat nyata dari hashing di sini: (1) PIN gak kebaca mentah cuma dengan buka
// DevTools/localStorage kayak sebelumnya, (2) salt per-install nyegah 1 rainbow table generik
// dipake ke SEMUA instalasi VaeltrixAI sekaligus, (3) dikombinasi throttling percobaan gagal di
// bawah, brute-force LEWAT APP (bukan langsung ke storage) jadi jauh lebih lambat. ini local app
// lock, BUKAN pengganti keamanan akun/server — sesuai section 31 brief soal Premium/quota,
// prinsip yang sama berlaku di sini: client-side entitlement/lock bukan tamper-proof.
async function hashPin(pin, salt) {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(salt + ":" + pin));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function generateSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
}
function getPinRecord() { return safeStorageGet("vaeltrix_pin_v2", null); }
function hasPinSet() { return !!getPinRecord() || !!localStorage.getItem("vaeltrix_pin"); }

// Migrasi PIN plaintext lama (sebelum v1.8.0) -> hashed, TRANSPARAN — user yang udah punya PIN
// gak perlu masukin ulang/reset apapun. Backward-compatible sesuai rule 16 brief ("Semua
// perubahan harus backward-compatible terhadap data user yang sudah tersimpan").
async function migratePinToHashed() {
  const legacy = localStorage.getItem("vaeltrix_pin");
  if (!legacy || getPinRecord()) return; // gak ada yang perlu dimigrasi, atau udah pernah dimigrasi
  try {
    const salt = generateSalt();
    const hash = await hashPin(legacy, salt);
    safeStorageSet("vaeltrix_pin_v2", { hash, salt });
    localStorage.removeItem("vaeltrix_pin");
    console.log("VaeltrixAI: PIN lama berhasil dimigrasi ke bentuk hashed.");
  } catch (e) {
    // Web Crypto gak kesedia (context gak secure/HTTP, browser aneh) — PIN lama TETAP DIBIARIN
    // APA ADANYA (BUKAN dihapus paksa), app lock tetap jalan pakai jalur legacy sampai crypto
    // kesedia lagi. Sesuai rule 17 brief: jangan hapus data lama tanpa verifikasi sukses.
    console.warn("[VX-SECURITY-001] Migrasi PIN gagal, tetap pakai PIN lama:", e.message);
  }
}

function openAccountSecurity() {
  const has = hasPinSet();
  document.getElementById("pin-modal-title").textContent = has ? "UBAH PIN" : "ACCOUNT SECURITY";
  document.getElementById("pin-modal-sub").textContent = has
    ? "PIN Kamu Lagi Aktif. Masukkan PIN Baru Buat Ganti, Atau Matikan Di Bawah."
    : "Amankan VaeltrixAI Kamu Dengan PIN 4-6 Digit. PIN Ini Cuma Tersimpan Di Device Ini, Bukan Di Server.";
  document.getElementById("pin-input-1").value = "";
  document.getElementById("pin-input-2").value = "";
  document.getElementById("pin-modal-error").textContent = "";
  document.getElementById("pin-remove-btn").style.display = has ? "block" : "none";
  document.getElementById("pin-modal").style.display = "flex";
}
function closePinModal() { document.getElementById("pin-modal").style.display = "none"; }
async function savePinSecurity() {
  const p1 = document.getElementById("pin-input-1").value.trim();
  const p2 = document.getElementById("pin-input-2").value.trim();
  const err = document.getElementById("pin-modal-error");
  if (!/^\d{4,6}$/.test(p1)) { err.textContent = "PIN Harus 4-6 Digit Angka."; return; }
  if (p1 !== p2) { err.textContent = "PIN Gak Sama, Coba Lagi."; return; }
  try {
    const salt = generateSalt();
    const hash = await hashPin(p1, salt);
    safeStorageSet("vaeltrix_pin_v2", { hash, salt });
    safeStorageRemove("vaeltrix_pin"); // bersihin sisa plaintext lama kalau ada
  } catch (e) {
    console.warn("[VX-SECURITY-001] Gagal hash PIN:", e.message);
    err.textContent = "Gagal Menyimpan PIN (Coba Lagi, Tuan).";
    return;
  }
  const secEl = document.getElementById("settings-val-security");
  if (secEl) secEl.textContent = "PIN Aktif";
  closePinModal();
  showToast("PIN Diaktifkan — VaeltrixAI Kamu Sekarang Lebih Aman");
}
function removePinSecurity() {
  safeStorageRemove("vaeltrix_pin_v2");
  safeStorageRemove("vaeltrix_pin");
  pinFailedAttempts = 0; pinLockedUntil = 0;
  const secEl = document.getElementById("settings-val-security");
  if (secEl) secEl.textContent = "Standard";
  closePinModal();
  showToast("PIN Dimatikan");
}

async function checkAppLock() {
  await migratePinToHashed();
  if (hasPinSet()) document.getElementById("applock-screen").classList.add("show");
}
// Failed-attempt throttling — di memori doang (BUKAN dipersist ke storage), reset tiap reload.
// SENGAJA gak dibikin permanen (rule eksplisit di brief: "Jangan membuat mechanism yang mengunci
// user secara permanen") — delay makin lama tiap kelipatan 3x gagal beruntun, di-CAP 60 detik,
// selalu bisa dicoba lagi.
let pinFailedAttempts = 0;
let pinLockedUntil = 0;
async function tryUnlockApp() {
  const input = document.getElementById("applock-input");
  const err = document.getElementById("applock-error");

  if (Date.now() < pinLockedUntil) {
    err.textContent = `Kebanyakan Salah — Tunggu ${Math.ceil((pinLockedUntil - Date.now()) / 1000)} Detik Lagi, Tuan.`;
    input.value = "";
    return;
  }

  const entered = input.value.trim();
  const record = getPinRecord();
  let ok = false;
  if (record) {
    try {
      ok = (await hashPin(entered, record.salt)) === record.hash;
    } catch (e) {
      // Web Crypto gagal di tengah verifikasi — JANGAN otomatis "lolosin" (lubang keamanan) DAN
      // JANGAN ngunci permanen (dilarang di brief) — tampilin error, user masih bisa coba lagi.
      console.warn("[VX-SECURITY-001] Verifikasi PIN gagal:", e.message);
      err.textContent = "Gagal Verifikasi PIN, Coba Lagi.";
      input.value = "";
      return;
    }
  } else {
    // Fallback jalur legacy — cuma kepake di jendela sempit sebelum migratePinToHashed() kelar,
    // atau kalau migrasi gagal karena Web Crypto gak kesedia sama sekali.
    ok = entered === localStorage.getItem("vaeltrix_pin");
  }

  if (ok) {
    pinFailedAttempts = 0; pinLockedUntil = 0;
    document.getElementById("applock-screen").classList.remove("show");
    input.value = ""; err.textContent = "";
  } else {
    pinFailedAttempts++;
    input.value = "";
    if (pinFailedAttempts >= 3) {
      const delaySec = Math.min(10 * Math.floor(pinFailedAttempts / 3), 60);
      pinLockedUntil = Date.now() + delaySec * 1000;
      err.textContent = `PIN Salah ${pinFailedAttempts}x — Tunggu ${delaySec} Detik.`;
    } else {
      err.textContent = "PIN Salah, Coba Lagi.";
    }
    input.focus();
  }
}

// ---- Feedback (tersimpan lokal, siap dikembangkan ke backend nanti) ----
function openFeedbackModal() {
  document.getElementById("feedback-input").value = "";
  document.getElementById("feedback-error").textContent = "";
  document.getElementById("feedback-modal").style.display = "flex";
}
function closeFeedbackModal() { document.getElementById("feedback-modal").style.display = "none"; }
function sendFeedback() {
  const text = document.getElementById("feedback-input").value.trim();
  const err = document.getElementById("feedback-error");
  if (!text) { err.textContent = "Tulis Dulu Feedback Kamu, Tuan."; return; }
  // BUG DITEMUKAN saat hardening P0.4: sebelumnya baris ini pakai key "vaeltrix_feedback" — key
  // yang SAMA PERSIS dipakai vFeedback (01-config.js) buat nyimpen reaction 👍/👎 per pesan (bentuk
  // OBJECT). Di sini isinya di-treat sebagai ARRAY (daftar teks feedback). Dua fitur beda nabrak
  // 1 key: nyimpen di sini bisa nimpa reaction yang udah ada, ATAU (kalau vFeedback udah nulis
  // object duluan) `stored.push()` di bawah bakal throw TypeError — ketangkep diam-diam sama
  // `catch {}`, jadi user ngerasa feedback-nya "terkirim" (toast sukses tetep muncul) padahal
  // gak pernah beneran kesimpen. Sekarang pakai key sendiri, gak nabrak.
  const stored = safeStorageGet("vaeltrix_feedback_submissions", []);
  stored.push({ text, at: Date.now() });
  safeStorageSet("vaeltrix_feedback_submissions", stored);
  closeFeedbackModal();
  showToast("Makasih Feedback-nya, Tuan!");
}

// ---- Memory Space (Auto-Save toggle, gerbangnya ada di addMemoryFacts) ----
function isMemoryAutoSaveOn() { return localStorage.getItem("vaeltrix_memory_autosave") !== "0"; }

// ---- Play Voice ----
function getVoiceURI() { return localStorage.getItem("vaeltrix_voice_uri") || ""; }
// Provider: "browser" (Web Speech API, gratis, default/fallback) atau "elevenlabs" (natural, butuh API key)
function getVoiceProvider() { return localStorage.getItem("vaeltrix_voice_provider") || "browser"; }
function setVoiceProvider(p) { localStorage.setItem("vaeltrix_voice_provider", p); }
function getElevenLabsKey() { return localStorage.getItem("vaeltrix_elevenlabs_key") || ""; }
function getElevenLabsVoiceId() { return localStorage.getItem("vaeltrix_elevenlabs_voice_id") || ELEVENLABS_VOICES[0].id; }
function getVoiceLabel() {
  if (getVoiceProvider() === "elevenlabs") {
    const v = ELEVENLABS_VOICES.find(v => v.id === getElevenLabsVoiceId());
    return (v ? v.name : "Rachel") + " (ElevenLabs)";
  }
  const uri = getVoiceURI();
  if (!uri) return "Default";
  if (!("speechSynthesis" in window)) return "Default";
  const v = (speechSynthesis.getVoices() || []).find(v => v.voiceURI === uri);
  return v ? v.name : "Default";
}

// ---- Theme ----
function getTheme() { return localStorage.getItem("vaeltrix_theme") || "auto"; }
function resolveTheme(t) {
  if (t === "auto") {
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }
  return t;
}
function applyTheme(t) {
  const resolved = resolveTheme(t);
  document.body.classList.toggle("theme-light", resolved === "light");
  localStorage.setItem("vaeltrix_theme", t);
}
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getTheme() === "auto") applyTheme("auto");
  });
}
function getThemeLabel(t) {
  const v = t ?? getTheme();
  return v === "light" ? "Light" : v === "auto" ? "Auto" : "Dark";
}

// ---- Font Size ----
function getFontSize() { return localStorage.getItem("vaeltrix_font_size") || "standard"; }
function getFontSizeLabel() {
  const f = getFontSize();
  return f === "small" ? "Small" : f === "large" ? "Large" : "Standard";
}
function applyFontSize(f) {
  document.body.classList.remove("font-size-small", "font-size-large");
  if (f === "small") document.body.classList.add("font-size-small");
  if (f === "large") document.body.classList.add("font-size-large");
  localStorage.setItem("vaeltrix_font_size", f);
}

// ---- Upaya (Reasoning Effort) ----
// Cuma 3 tingkat NYATA (Rendah/Sedang/Tinggi) — BUKAN 5 kayak Claude (Rendah/Sedang/Tinggi/Ekstra/
// Maks). Ini sengaja jujur ke kemampuan API asli: Gemini 3.x (thinkingLevel) & GPT-OSS di Groq
// (reasoning_effort) SAMA-SAMA cuma nyediain 3 tingkat low/medium/high di API mereka. Nambahin
// 2 tingkat "ekstra" lagi cuma bakal jadi tombol kosong yang gak ngubah apa-apa di baliknya.
//
// v1.8.0: default sekarang "auto" (Adaptive Reasoning Controller di 07-providers.js yang milihin
// low/medium/high OTOMATIS per-pesan berdasarkan seberapa berat pertanyaannya — lihat
// resolveEffort()). Kalau user manual milih Rendah/Sedang/Tinggi di sini, pilihan itu SELALU
// dipakai apa adanya buat SEMUA pesan (persis perilaku lama) — auto cuma jalan kalau belum
// pernah disentuh/sengaja dipilih balik ke Auto.
function getEffort() { return localStorage.getItem("vaeltrix_effort") || "auto"; }
function getEffortLabel() {
  const e = getEffort();
  return e === "low" ? "Rendah" : e === "high" ? "Tinggi" : e === "medium" ? "Sedang" : "Otomatis";
}
function applyEffort(e) { localStorage.setItem("vaeltrix_effort", e); }

// ---- Pemikiran Terang-Terangan (Force Thinking) ----
// PENTING — ini bedanya sama "Upaya": Upaya (thinkingLevel/reasoning_effort) ngatur SEBERAPA DALAM
// model mikir secara internal (ngaruh ke kualitas jawaban), tapi hasil mikirnya gak pernah
// ditampilin ke user sebelumnya — dulu ada UI "Berpikir" di kode, tapi gak kepakai sama sekali
// karena callback-nya gak pernah kesambung ke provider manapun (ketauan pas riset fitur ini).
// Toggle ini yang beneran nampilin proses mikirnya (kayak Grok/Claude/Kimi), bukan cuma
// ngatur kualitasnya doang.
function isForceThinkingEnabled() { return localStorage.getItem("vaeltrix_force_thinking") === "1"; }
function toggleForceThinking(on) {
  localStorage.setItem("vaeltrix_force_thinking", on ? "1" : "0");
  showToast(on ? "Pemikiran Terang-Terangan Diaktifkan" : "Pemikiran Terang-Terangan Dimatikan");
}

// ---- Language (bahasa jawaban AI, bukan bahasa UI) ----
function getLanguage() { return localStorage.getItem("vaeltrix_language") || "id"; }
function applyLanguage(l) { localStorage.setItem("vaeltrix_language", l); }
function getLanguageAddon() {
  return getLanguage() === "en"
    ? "\n\nPENTING SOAL BAHASA: User Sudah Atur Preferensi Bahasa Jawaban Ke Bahasa Inggris. Jawab SELALU Dalam Bahasa Inggris (English), Apapun Bahasa Yang Dipakai User Untuk Bertanya."
    : "";
}

// ---- Feature Management (Beta) ----
function isBetaEnabled() { return localStorage.getItem("vaeltrix_beta") === "1"; }
function toggleFeatureManagement() {
  const now = !isBetaEnabled();
  localStorage.setItem("vaeltrix_beta", now ? "1" : "0");
  const el = document.getElementById("settings-val-beta");
  if (el) el.textContent = now ? "Beta On" : "Beta Off";
  document.querySelectorAll(".beta-badge").forEach(b => b.style.display = now ? "inline" : "none");
  showToast(now ? "Fitur Beta Diaktifkan — Fitur Baru Ditandai Badge BETA" : "Fitur Beta Dimatikan");
}

// ---- Notification Settings ----
function isNotifEnabled() { return localStorage.getItem("vaeltrix_notif") === "1"; }
function toggleNotificationSettings() {
  if (!("Notification" in window)) { showToast("Browser Kamu Gak Support Notifikasi", true); return; }
  if (isNotifEnabled()) {
    localStorage.setItem("vaeltrix_notif", "0");
    const el = document.getElementById("settings-val-notif");
    if (el) el.textContent = "Off";
    showToast("Notifikasi Dimatikan");
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === "granted") {
      localStorage.setItem("vaeltrix_notif", "1");
      const el = document.getElementById("settings-val-notif");
      if (el) el.textContent = "On";
      showToast("Notifikasi Diaktifkan — Vaeltrix Bakal Ngingetin Kalau Jawaban Udah Siap");
    } else {
      showToast("Izin Notifikasi Ditolak Browser", true);
    }
  });
}
function notifyIfBackground(title, body) {
  if (!isNotifEnabled() || document.visibilityState === "visible") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch {}
}

// ---- About / Check for Updates ----
function openAboutModal() { document.getElementById("about-modal").style.display = "flex"; }
function closeAboutModal() { document.getElementById("about-modal").style.display = "none"; }

const VX_LEGAL_CONTENT = {
  terms: {
    title: "Terms of Service",
    body: `<p style="margin:0 0 8px;font-size:0.8rem;opacity:0.7;font-style:italic;">English</p>
<p style="margin:0 0 8px;font-size:0.8rem;opacity:0.7;font-style:italic;">Effective Date: August 27, 2026</p>
<p style="margin:3px 0 7px;line-height:1.52;">Thank you for using Vaeltrix!</p>
<p style="margin:3px 0 7px;line-height:1.52;">This Service Agreement (<strong>"Agreement"</strong>) applies to your use of Vaeltrix and other Services provided by Vaeltrix for individual users, including related applications and websites (collectively referred to as the <strong>"Service"</strong>).</p>
<p style="margin:3px 0 7px;line-height:1.52;">This Agreement constitutes a legally binding agreement between you and Nth Power Global Tech Singapore Pte. Ltd. (a company incorporated under the laws of Singapore, hereinafter referred to as <strong>"Vaeltrix"</strong>, <strong>"we/us"</strong>, or <strong>"the Company"</strong>) and includes important provisions regarding applicable law and dispute resolution. Your use of our Service constitutes your agreement to be bound by this Agreement.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Our <strong>"Privacy Policy"</strong> explains how we collect and use personal information. Although the Policy does not form part of these terms, it is an important document that you should read.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">About Us</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Vaeltrix is committed to making advanced artificial intelligence accessible to everyone. We transform cutting-edge AI research into intuitive and easy-to-use products and services, delivering high-quality intelligent experiences to users worldwide.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Account Registration, Access, and Management</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Minimum age requirement. You must be at least 18 years old to register for and use our Service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Registration. You must provide accurate and complete information when registering an account and using our Service. You shall not share your account credentials or make your account available to others, and you shall be responsible for all activities that occur under your account. If you create an account or use the Service on behalf of another person or entity, you must have the legal authority to agree to these terms on their behalf.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Log in via a third-party service. If you choose to log in to our Service using a third-party service such as Google and Apple, you grant us permission to access, use, and store your information from the service, which may include login credentials and/or access tokens for the service, as permitted by the service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">If you are not logged in to your account, some features will be unavailable.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Account deletion. An account deletion feature is provided for you. You may request the deletion of your account through the online deletion procedures offered by Vaeltrix.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Service Usage Rules</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Permitted Use. You may access and use our Service, provided that you comply with these terms. When using the Service, you must comply with all applicable laws, our <strong>"Use Policy"</strong>, and any documents, guidelines, or policies we provide to you on our website or through other means.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Prohibited Use. You shall not use our Service for any illegal, harmful, or abusive activities, including but not limited to:</p>
<ul style="margin:2px 0 8px;padding-left:1.15em;list-style:disc;">
<li style="margin-bottom:4px;line-height:1.5;">Attempting to reverse engineer, decompile, or seek the source code or underlying components of our Service (including our algorithms or systems), or assisting others in doing so (unless such restrictions are prohibited by applicable law).</li>
<li style="margin-bottom:4px;line-height:1.5;">Modifying or damaging the original state of the Service we provide. Interfering with the display of any source pages of the Service we provide in any manner, such as overlaying, inserting, and using pop-ups. Bypassing any rate and access limits, or any protective measures and security mitigations we have implemented for the Service.</li>
<li style="margin-bottom:4px;line-height:1.5;">Interfering with or attempting to interfere with any user&#x27;s or any other party&#x27;s access to the Service.</li>
<li style="margin-bottom:4px;line-height:1.5;">Modifying, copying, leasing, selling, distributing, or manipulating our Service; using bots to access the Service.</li>
<li style="margin-bottom:4px;line-height:1.5;">Extracting data or outputting content through automated or programmatic means.</li>
<li style="margin-bottom:4px;line-height:1.5;">Attempting to probe, scan, test vulnerabilities in our Service systems or networks, or otherwise engaging in activities that compromise network security.</li>
<li style="margin-bottom:4px;line-height:1.5;">Using the Service and content generated by the Service to develop products and models that compete with Vaeltrix products and services, including developing or training any artificial intelligence or machine learning algorithms or models.</li>
<li style="margin-bottom:4px;line-height:1.5;">Using our Service in a manner that infringes upon, misappropriates, or violates the rights of any person, such as violating copyright, trademark, or other intellectual property laws; infringing upon others&#x27; rights to privacy or portrait/reputation; or engaging in sexualization or exploitation involving children.</li>
<li style="margin-bottom:4px;line-height:1.5;">Misleading others or lacking transparency in the use of AI, such as falsely representing non-AI-generated output as human-generated.</li>
<li style="margin-bottom:4px;line-height:1.5;">Using output involving an individual, without human review, in decision-making scenarios that may have legal or material impacts on such an individual, such as decisions regarding credit, education, employment, housing, insurance, legal matters, and healthcare.</li>
<li style="margin-bottom:4px;line-height:1.5;">Using the Service to provide advice that shall be rendered by professionals (such as lawyers or doctors) without the corresponding professional qualifications or service credentials.</li>
</ul>
<p style="margin:3px 0 7px;line-height:1.52;">Use Policy. You shall also comply with the <strong>"Use Policy"</strong> when using this Service. This policy explains how you should use our Service and products.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Third-party service and software. Our Service may include or integrate third-party software, products, or services, which are governed by their own terms, and for which we assume no liability. Our software may include open-source software governed by its own licenses.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Limitations of AI</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Vaeltrix products and their services represent a new technology. Such technology is still continuously improving, and, like many popular artificial intelligence systems on the market, Vaeltrix&#x27;s outputs are inherently unpredictable. Its outputs may include content not specified in the input while excluding content that was specified, and may occasionally produce inaccurate, inappropriate, or offensive information. Such information does not reflect the views of the Company. Despite our best efforts, due to objective limitations in the current stage of scientific and technological development, we cannot guarantee the truthfulness, accuracy, or reliability of Vaeltrix&#x27;s outputs. Please carefully review and verify any information that you deem important.</p>
<p style="margin:3px 0 7px;line-height:1.52;">We enable Vaeltrix to perform real-time searches on the internet to obtain up-to-date and accurate information, thereby reducing the risk of hallucinations that may arise from relying solely on the model&#x27;s static training data. Specifically, during your conversation with Vaeltrix, if the system detects your intent to perform an online search or if you actively choose the online search function, this Service will automatically retrieve information from publicly available third-party sources through non-human retrieval. This enables the model to gather additional information for better understanding and generating responses to your prompts. Vaeltrix will display the reference sources and related content on the response page. However, please note that the publicly available information (such as web pages) shown in the reference sources is produced by third parties, and the response is an automated intelligent synthesis generated by the large AI model based on its cross-domain knowledge and natural language understanding capabilities. This does not imply that our company endorses content or viewpoints expressed in the information from publicly available sources or in the responses. Moreover, even when reference sources are indicated, the responses may still contain errors.</p>
<p style="margin:3px 0 7px;line-height:1.52;">You should not treat the output of the Service as the sole source of truth or factual information, nor should you treat such output as a substitute for professional advice. You are responsible for evaluating the accuracy and suitability of the output, including conducting human review and oversight, before using or sharing it.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Scope and Grant of Software License</h2>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">Scope of Software</h3>
<ul style="margin:2px 0 8px;padding-left:1.15em;list-style:disc;">
<li style="margin-bottom:4px;line-height:1.5;">Grant of software license. We grant you a personal, non-transferable, and non-exclusive license to the software, including applications for Vaeltrix products. In order to improve user experience and enhance Service offerings, we will continuously strive to develop new services and periodically provide you with software updates (which may take the form of software replacement, modification, feature enhancement, version upgrades, etc.).</li>
<li style="margin-bottom:4px;line-height:1.5;">Reservation of software license. All other rights not expressly granted under this Agreement are reserved by us, and you must obtain our prior written permission to exercise any of these rights. Our failure to exercise any of the aforementioned rights does not constitute a waiver of such rights.</li>
</ul>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Uninstallation of Software</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you no longer need to use Vaeltrix products or need to install a new version of the software, you can uninstall it yourself. If you are willing to help us improve our product and Service, we would greatly appreciate your feedback on the reasons for uninstalling the software.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Intellectual Property and Other Rights</h2>
<p style="margin:3px 0 7px;line-height:1.52;">The intellectual property rights in the content provided by the Company in its Service (including but not limited to software, technology, programs, web pages, text, images, graphics, audio, video, charts, layout designs, and electronic documents) belong to the Company. The copyright, trademark rights, patent rights, trade secrets, and other intellectual property rights in the software underlying the Vaeltrix Service are all owned by the Company. Without the Company&#x27;s permission, no person may use or transfer such content (including but not limited to monitoring, copying, distributing, displaying, mirroring, uploading, and downloading content from products and related services of Vaeltrix by any robot, spiders, and other programs or devices).</p>
<p style="margin:3px 0 7px;line-height:1.52;">You may provide input content (<strong>"Input"</strong>) to the Service and receive output content (<strong>"Output"</strong>) generated based on the Input; the Input and Output are collectively referred to as <strong>"Content"</strong> . You warrant that all text, images, documents, and other content input when using the Service are either originally created by you or lawfully authorized (including sublicense) by you, and that such content does not infringe upon intellectual property rights, the rights to portrait, reputation, name, and privacy, personal information rights and interests, trade secrets, or other legitimate rights and interests.</p>
<p style="margin:3px 0 7px;line-height:1.52;">The intellectual property rights and/or related rights and interests in the content you input through the Service belong to you or the original rights holder. With respect to <strong>"Output"</strong>, any rights, ownership, and interests (if any) in the output content by the Service are assigned to you in the context of your relationship with the Company. You acknowledge and authorize that, provided the content has undergone secure encryption processing, strict de-identification, and cannot be re-identified to a specific individual, we may use such content to provide, maintain, develop, and improve our Service, comply with applicable laws, regulations, and policies, enforce our terms and use policy, and ensure the security of our Service. Please rest assured that we will not use your <strong>"Input"</strong> content provided to the Service or the <strong>"Output"</strong> content obtained from the Service for model training purposes.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Similarity of content. Due to the nature of artificial intelligence, output content may not be unique, and different users may receive similar outputs from our Service. Your rights to the output content do not extend to the rights of others.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Under no circumstances shall you use, without authorization, any of the Company&#x27;s trademarks, service marks, trade names, domain names, website names, or other distinctive brand features (collectively referred to as <strong>"Marks"</strong>), including <strong>"Vaeltrix"</strong>. Without the Company&#x27;s prior written consent, you shall not display, use, or otherwise exploit the aforementioned marks in any manner, whether individually or in combination.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Feedback. To the extent of any suggestions, recommendations, or other feedback (collectively, <strong>"Feedback"</strong>) you provide regarding the Service or other Vaeltrix products or services, you hereby assign to the Company all rights (including all intellectual property rights), ownership, and interests in and to such feedback. Accordingly, we may use the feedback and any ideas, proprietary technology, concepts, techniques, and/or other intellectual property contained therein for any purpose without providing attribution or compensation to you. We are under no obligation to use any feedback.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Termination, Suspension, and Discontinuation</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Termination. You may freely stop using our Service and delete your account at any time. We reserve the right to suspend or terminate your access to the Service, or delete your account, without prior notice, if we determine at our sole discretion that any of the following has occurred:</p>
<ul style="margin:2px 0 8px;padding-left:1.15em;list-style:disc;">
<li style="margin-bottom:4px;line-height:1.5;">You have violated this Agreement or our &quot;Use Policy&quot;.</li>
<li style="margin-bottom:4px;line-height:1.5;">We must do this in order to comply with legal requirements.</li>
<li style="margin-bottom:4px;line-height:1.5;">Your use of the Service may pose risks or cause harm to Vaeltrix, our users, or any other person.</li>
</ul>
<p style="margin:3px 0 7px;line-height:1.52;">Appeal. If you believe your account was suspended or terminated in error, you may submit an appeal by contacting <code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrixteam@gmail.com</code>.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Service discontinuation. We may decide to discontinue the Service. In the event of such discontinuation, we will provide you with notice.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Disclaimer of Warranty</h2>
<p style="margin:3px 0 7px;line-height:1.52;">To the fullest extent permitted by law, the Service is provided on an <strong>"as is"</strong> and <strong>"as available"</strong> basis, and your use of the Service shall be at your own risk. Except where prohibited by law, we, along with our affiliates and licensors, do not make any warranties of any kind (whether express, implied, statutory, or otherwise), and expressly disclaim all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, satisfactory quality, and non-infringement. Neither we nor our officers, directors, employees, or agents guarantee that the functions or features of the Service will be uninterrupted, error-free, or completely secure, nor do we guarantee that any defects will be corrected or that content will not be lost or altered. You understand and agree that artificial intelligence and machine learning are probabilistic, and their outputs may not accurately reflect real people, places, or facts; they may sometimes provide incomplete, inaccurate, or offensive information. Therefore, you accept that any risk associated with your use of the Service&#x27;s outputs (including any content, materials, or output results) is borne by you, and you agree not to rely on such outputs as the sole source of truth or factual information, nor as a substitute for professional advice in legal, medical, financial, or other specialized fields.</p>
<p style="margin:3px 0 7px;line-height:1.52;">The non-binding nature of outputs. You understand and agree that any outputs generated by this Service, particularly information that may appear to constitute an offer, promise, guarantee, or gift (such as promises of prizes, gifts, rewards, provision of specific services, or completion of a transaction), are automatically generated by algorithmic models without human intervention and may be fictional or erroneous. Such content does not reflect the Company&#x27;s actual intent and does not constitute any legally binding offer or commitment to you or any third party. The Company will not fulfill any of the aforementioned non-genuine commitments automatically generated by this Service. We understand this may cause you inconvenience, but we ask for your understanding that we cannot assume responsibility for any issues arising from reliance on such unofficial information.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Limitation of Liability</h2>
<p style="margin:3px 0 7px;line-height:1.52;">To the fullest extent permitted by law, we, our affiliates, and licensors, are not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages arising from to the use of or inability to use the Service or any part thereof, including but not limited to damages for loss of profits, goodwill, use rights, data, or other intangible losses, even if the Service provider has been informed of the possibility of such damages. Under these terms, our total aggregate liability to you shall in no event exceed the greater of: the amount (if any) you have paid us under this Agreement, or one hundred dollars ($100.00);</p>
<p style="margin:3px 0 7px;line-height:1.52;">All limitations in this section apply only to the maximum extent permitted by applicable law. Since the laws of certain jurisdictions do not allow the exclusion of certain warranties or the limitation of specific damages, if the laws of your place of residence grant you additional statutory rights, our liability under these terms is limited only to the maximum extent permitted by such laws.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Compensation</h2>
<p style="margin:3px 0 7px;line-height:1.52;">To the fullest extent permitted by law, you agree to defend, indemnify, and hold harmless us, our parent company, subsidiaries, affiliates, and our employees from and against any third-party claims, losses, liabilities, costs, and expenses (including but not limited to reasonable attorneys&#x27; fees) arising out of or related to: (i) your use of the Service and output content; (ii) your input content or any materials you provide to us; (iii) your breach of this Agreement or applicable laws; or (iv) any activities attributable to your account.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Governing Law and Dispute Resolution</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Unless otherwise expressly agreed in the <strong>"Supplemental Terms for Specific Regions"</strong> below, these terms apply to your use of the Service.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">General Rules</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Governing law. These terms and their subject matter, formation (conclusion), interpretation, and performance shall be governed by Singapore law (excluding its conflict of laws rules).</p>
<p style="margin:3px 0 7px;line-height:1.52;">Amicable negotiations. Any dispute arising out of or in connection with these terms (including any question regarding their existence, validity, or termination) shall first be resolved through amicable negotiations between the parties. The negotiation period shall be thirty (30) days, commencing from the date on which one party delivers a notice of dispute to the other party through our published customer service channels (such as in-app support or email).</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">Default dispute resolution method (Singapore arbitration)</h3>
<p style="margin:3px 0 7px;line-height:1.52;">Unless otherwise provided in the <strong>"Supplementary Terms for Specific Regions"</strong>, if the dispute remains unresolved upon expiry of the negotiation period, it shall be submitted to and finally resolved by arbitration at the Singapore International Arbitration Centre (SIAC) in accordance with its arbitration rules in effect at the time; such rules are deemed incorporated into these terms by reference.</p>
<p style="margin:3px 0 7px;line-height:1.52;">The seat of arbitration shall be Singapore; the arbitral tribunal shall consist of one (1) arbitrator; and the language of arbitration shall be English. The arbitral award shall be final and binding upon both parties.</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">Reservation of mandatory consumer rights</h3>
<p style="margin:3px 0 7px;line-height:1.52;">Notwithstanding any other provision herein, these terms do not affect your rights or remedies under the mandatory consumer protection laws applicable in your place of habitual residence or the jurisdiction where you use the Service. Where any provision of these terms conflicts with such mandatory provisions, the mandatory provisions shall prevail to the extent of the conflict, and these terms shall be modified to the minimum extent necessary to ensure enforceability.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Where applicable law grants consumers the right to choose a dispute resolution method, a right of withdrawal, or other statutory rights (e.g., the right to seek relief before a court or competent authority in their place of residence, or to rescind a pre-agreed arbitration arrangement), you may exercise such rights in accordance with the law, and these terms shall not restrict such rights to the extent of any conflict.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Furthermore, these terms do not limit your right to file complaints, reports, or seek administrative remedies with the competent authorities as permitted by law.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Supplementary Terms for Specific Regions</h2>
<p style="margin:3px 0 7px;line-height:1.52;">These terms apply when you are located in or ordinarily reside in the following countries/regions during your use of this Service; in the event of any conflict with the <strong>"General Rules"</strong>, these supplementary terms shall prevail.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Mexico</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you use the Service in Mexico: These terms and their subject matter, formation (conclusion), interpretation, and performance shall be governed by the federal laws of Mexico. Any dispute not resolved after the expiration of the amicable negotiation period shall be submitted to the competent courts of Mexico for resolution.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Language precedence: To comply with Mexican consumer protection requirements, the Spanish version of these terms shall prevail; versions in other languages are for reference only.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Brazil</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you use the Service in Brazil: These terms and their subject matter, formation (conclusion), interpretation, and performance shall be governed by Brazilian law. Any dispute not resolved after the expiration of the amicable negotiation period shall be submitted to the competent courts of Brazil for resolution (to the extent permitted by law, judicial arrangements that are more convenient for the consumer, such as the courts of the consumer&#x27;s domicile or residence, shall take precedence).</p>
<p style="margin:3px 0 7px;line-height:1.52;">Language precedence: The Portuguese version of these terms shall prevail; versions in other languages are for reference only.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Indonesia</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you use the Service in Indonesia: These Terms and their subject matter, formation (conclusion), interpretation, and performance shall be governed by Indonesian law. Any dispute not resolved after the expiration of a friendly negotiation period shall be submitted to the competent courts of Indonesia or resolved in accordance with the procedures of a consumer dispute resolution mechanism established by law.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Where permitted by applicable law and expressly agreed upon separately by you and us, disputes may also be submitted to the Badan Arbitrase Nasional Indonesia (BANI) for arbitration in accordance with its rules in effect at the time, with the seat of arbitration in Jakarta, and the language of arbitration shall be English. If enforcement of an arbitral award is required in Indonesia, both parties agree to cooperate in completing the necessary registration/enforcement procedures to the extent permitted by applicable law.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Language precedence: We will provide users in Indonesia with an Indonesian version of these terms. If other language versions are provided for reference and any inconsistency or discrepancy in interpretation arises between versions, the Indonesian version shall prevail.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Copyright Complaints</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you believe your intellectual property rights have been infringed and such content is accessible through this Service, you agree to first notify our copyright agent as instructed below or complete [this form] (hyperlink). Where feasible, we may, at our discretion, remove or disable access to content that we determine violates these terms or is suspected of infringement, and terminate the accounts of repeat infringers.</p>
<p style="margin:3px 0 7px;line-height:1.52;">You may contact our copyright agent via email: Recipient: 【Legal Department】, Email: 【<code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrixteam@gmail.com</code>】.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Written claims of copyright infringement must include all of the following information:</p>
<ul style="margin:2px 0 8px;padding-left:1.15em;list-style:disc;">
<li style="margin-bottom:4px;line-height:1.5;">Handwritten or electronic signature of the authorized agent of the copyright owner;</li>
<li style="margin-bottom:4px;line-height:1.5;">Description of the copyrighted work you claim has been infringed;</li>
<li style="margin-bottom:4px;line-height:1.5;">A description of the specific location of the allegedly infringing material on the website (to enable us to locate it);</li>
<li style="margin-bottom:4px;line-height:1.5;">Your address, phone number, and email address;</li>
<li style="margin-bottom:4px;line-height:1.5;">A statement issued by you declaring that you honestly believe the disputed use was not authorized by the copyright owner, its agent, or the law;</li>
<li style="margin-bottom:4px;line-height:1.5;">A statement issued by you declaring that the information stated above in the notice is accurate and confirming that you are either the copyright owner or authorized to act on behalf of the copyright owner, with acknowledgment that you may be subject to penalties for perjury if false.</li>
</ul>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">General Terms</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Assignment. No rights or obligations under these terms may be assigned or transferred by you, and any such attempt shall be void. We may assign or transfer our rights or obligations under these terms to any affiliate, subsidiary, or successor in interest to any business related to our Service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Amendments to this Agreement. The Company may modify the terms of this Agreement from time to time due to changes in legal or regulatory requirements, the need to protect consumer rights and interests, or the need to optimize Vaeltrix&#x27;s business model and service offerings. When material changes are made to this Agreement, the <strong>"Effective"</strong> date at the top of this page will be updated. Your continued use of the Service after any such amendment constitutes your acceptance of the updated Service Agreement. If you do not agree with any part of this Agreement or any future terms of service, please do not access or use (or continue to access or use) the Service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Composition of this agreement. Due to the rapid development of the internet and artificial intelligence industries, the terms set forth in this Agreement between you and us cannot fully enumerate or cover all rights and obligations between you and us, and existing provisions may not fully meet future developmental needs. Therefore, Vaeltrix supplements and refines these provisions through its <strong>"Use Policy"</strong>, terms of use for certain service modules, and separate rules. All such documents constitute an integral part of this Agreement, are inseparable from it, and carry the same legal effect. Your use of Vaeltrix or related services shall be deemed as your acceptance of all the aforementioned agreements.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Validity of terms. If any term of this Agreement is held to be void, invalid, or unenforceable, such term shall be deemed severable and shall not affect the validity or enforceability of the remaining terms of this Agreement.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Export controls and economic sanctions (trade controls). You understand and agree that your access to and use of the Service (including, without limitation, submitting any input to the Service, obtaining any output from the Service, and downloading, using, or receiving any software, technology, data, or materials related to the Service) may be subject to applicable export control and economic sanctions laws and regulations (collectively, <strong>"Trade Control Laws"</strong>). Trade Control Laws may include (without limitation) laws and regulations of the jurisdiction(s) where the Service or the associated generative AI model/server is located (which may include the United States), as well as the jurisdiction(s) from which you access, use, or receive the Service. You shall be solely responsible for compliance with all Trade Control Laws applicable to you. You represent, warrant, and agree that you will not, directly or indirectly, use the Service for any of the following:</p>
<ul style="margin:2px 0 8px;padding-left:1.15em;list-style:disc;">
<li style="margin-bottom:4px;line-height:1.5;"><strong>Comprehensively sanctioned/embargoed regions:</strong> Using this Service, or providing benefits therefrom, in any country or region subject to comprehensive sanctions or embargoes under applicable trade control laws;</li>
<li style="margin-bottom:4px;line-height:1.5;"><strong>Restricted parties:</strong> Providing the Service to, benefiting, or permitting access to/use of the Service by any individual or entity included on restricted or prohibited trade lists under applicable trade control laws;</li>
<li style="margin-bottom:4px;line-height:1.5;"><strong>Prohibited/restricted uses:</strong> Using this Service for any end use prohibited or restricted under applicable trade control laws, or to circumvent, violate, or assist others in circumventing or violating trade control laws;</li>
<li style="margin-bottom:4px;line-height:1.5;"><strong>Export/transfer restrictions:</strong> Exporting, re-exporting, transferring, providing, or otherwise making this Service or its associated technology/materials (or any derivatives thereof) accessible to the aforementioned restricted regions or restricted parties, or for the aforementioned prohibited/restricted uses without obtaining prior licenses, approvals, or authorizations from the applicable government (if required).</li>
</ul>
<p style="margin:3px 0 7px;line-height:1.52;">We reserve the right, to the extent permitted by law, to take measures, including restricting, suspending, or terminating your access to and use of the Service, if we reasonably determine that doing so is necessary to comply with trade control laws or as required by a competent authority, and we may request that you provide reasonable information or declarations relevant to compliance.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Contact details. For questions regarding this Agreement, please contact us at <code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrix@gmail.com</code>. Any inquiries about the service may be sent to <code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrixteam@gmail.com</code>.</p>`
  },
  privacy: {
    title: "Privacy Policy",
    body: `<p style="margin:0 0 8px;font-size:0.8rem;opacity:0.7;font-style:italic;">English</p>
<p style="margin:0 0 8px;font-size:0.8rem;opacity:0.7;font-style:italic;">Effective date: August, 17, 2026</p>
<p style="margin:3px 0 7px;line-height:1.52;">This Privacy Policy (<strong>“Policy”</strong>) explains how Vaeltrix (<strong>“Company,”</strong> <strong>“we,”</strong> <strong>“us”</strong>) collects, uses, discloses, and processes personal data when you use Vaeltrix and related services (the <strong>“Services”</strong>). This Policy does not apply to third-party services accessed through the Services, which are governed by their own privacy policies.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Data Controller: The Services are provided and managed by Nth Power Global Tech Singapore Pte Ltd, a company registered in Singapore (<strong>"we"</strong> or <strong>"us"</strong>). For inquiries about your personal data, contact us at <code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrixteam@gmail.com</code> or via the <strong>"Contact Us"</strong> section in the app or website.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Please review this Policy to understand how we handle and protect your personal data. By downloading, registering, or using our Services, you consent to these practices. If you do not agree, please do not use the Services. We may update this Policy periodically; continued use after changes indicates your acceptance of the revised terms.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">1. Personal Data We Collect</h2>
<p style="margin:3px 0 7px;line-height:1.52;">The personal data we collect, directly or indirectly, depends on your interactions with us and generally falls into the following categories:</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">A. Personal Data You Provide</h3>
<p style="margin:3px 0 7px;line-height:1.52;">When you use our Service, we collect your personal data (<strong>“Personal Data”</strong>) as follows:</p>
<p style="margin:3px 0 7px;line-height:1.52;">User Content: We may collect personal data that you provide or upload when accessing or using our Services, including your prompts and other content you upload, such as text, files, images, and audio (if any), depending on the features you use. Important: Please do not submit sensitive personal data (e.g., health records, government IDs, financial account numbers, precise geolocation, racial or ethnic origin, biometric data) unless you intend for the Service to process it as part of your request. See AI Features for additional details.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Account Data: We may collect your account data, such as your name, email address, nickname, and avatar, when you sign up for a Vaeltrix account, or when you otherwise provide us with your personal data (such as to receive information on our Services). We may also collect your email address or receive personal data from the Google Sign-In API or the Apple REST API. This may include identifiers such as your name, email address, and/or account identifier, depending on the options you select with Google or Apple.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Feedback Data: We welcome feedback, including suggestions for improvement and ratings of outputs. If you rate an output, such as using the thumbs-up or thumbs-down icon, we will store the related conversation as part of your feedback.</p>
<p style="margin:8px 0 3px;"><strong>B. Personal Data We Collect Automatically.</strong></p>
<p style="margin:3px 0 7px;line-height:1.52;">To enhance our Services, we may automatically collect data from you:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Device and Network Data: We may collect information about your device and its interaction with the Service, including device type and model, operating system and version, app version, language, settings, IP address, and approximate location derived from IP, if collected as part of standard network communications.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Usage Data: We may collect information about your use of the Services, including content you view or engage with, features used, actions taken, time zone, country, access dates and times, user agent and version, device type, and connection details.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Log Data: We may collect data your device automatically sends when you use our Services, such as device brand, model, and ID, IP address, browser type and settings, request date and time, and your interactions with our Service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Cookies: We may use cookies and similar technologies on our website to operate and improve our Services. For more information, please see our Web Cookies Policy.</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">C. Third-Party Platform Data</h3>
<p style="margin:3px 0 7px;line-height:1.52;">To support certain features and integrations, we may collect data from external platforms. For example, if you authenticate through a third-party service, we may receive your username, email address, or access tokens.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Other External Sources: We may obtain data about you from advertising and analytics partners, other users, or third-party contributors when promoting our Services.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">2. How We Use Your Personal Data</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We process personal data as needed to operate, deliver, maintain, and improve the Services. This includes the following purposes:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Service delivery and functionality: To provide the Services, manage access for users and visitors, and support interactive features, including AI-powered tools and conversational interfaces.</p>
<p style="margin:3px 0 7px;line-height:1.52;">User communications: To contact you about operational notices, feature changes, service updates, and other administrative matters, and to respond to your inquiries or requests.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Safety, integrity, and misuse prevention: To ensure the reliability, security, and proper functioning of the Services, and to detect, investigate, and address activities that may violate laws, our terms, or usage policies. Where legally permitted, this may include reviewing and analyzing user-generated content and related technical data.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Product improvement and innovation: To analyze usage, conduct research, develop and test new features, and enhance AI systems and technologies.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Personalization and user experience optimization: To tailor the Services to user preferences, improve output relevance and quality, and provide more responsive interactions.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Marketing and promotion: To promote the Services, deliver marketing messages, and conduct advertising through third-party platforms, where permitted by law.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Legal compliance and protection: To meet legal and regulatory requirements, protect our legal interests, and safeguard the rights, safety, and property of users and stakeholders.</p>
<p style="margin:3px 0 7px;line-height:1.52;">We may aggregate or de-identify personal data so it cannot reasonably identify individuals, and use this information for legitimate business or research purposes. We do not use automated processing or profiling to make decisions that have legal or similarly significant effects on you or others.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">3. How Your Inputs Are Processed</h2>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">A. Vaeltrix API</h3>
<p style="margin:3px 0 7px;line-height:1.52;">When utilizing AI functionalities (such as AI chat, document summarization, image comprehension, and translation), the content you provide may be sent to our service provider, VaeltrixLabs (Indonesian) Private Limited, for processing by the Vaeltrix LLM model API. In this context, VaeltrixLabs serves as a data processor in accordance with our directives. Your content might be processed in Singapore.</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">B. Data Minimization and Controls</h3>
<p style="margin:3px 0 7px;line-height:1.52;">We minimize the data sent for AI processing and protect it during transmission and storage. Depending on implementation, we may:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Send only the portion of the content needed to fulfill your request.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Apply technical controls such as access controls, logging, and encryption.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Limit internal access on a need-to-know basis.</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">C. Sensitive Content Reminder</h3>
<p style="margin:3px 0 7px;line-height:1.52;">Our Service is not designed for sensitive personal data. If you submit sensitive content, it will be processed as part of your request. Please use discretion and avoid submitting sensitive personal data unless necessary.</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">D. Use of User Content to Improve AI</h3>
<p style="margin:3px 0 7px;line-height:1.52;">We do not use your submitted content to train or fine-tune our or any third-party AI models, and we do not have humans review your submitted content except on a limited basis as necessary for security, fraud/abuse prevention, debugging, or to comply with applicable laws.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">4. How We Share Or Disclose Your Personal Data</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We share or disclose your personal data only as described below.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Service Providers and business partners.We partner with service providers and business associates who help deliver, maintain, and improve our Services. These partners support functions such as cloud infrastructure and hosting, authentication, AI integrations, safety monitoring, communications, analytics, advertising, marketing, and measurement. We share data with these providers under contracts that restrict their use of the data. Categories of service providers and what they receive include.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Cloud infrastructure &amp; hosting: VaeltrixLabs (Indonesian) Private Limited may process user content, account data, and logs as needed to host and operate the Service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">The LLM API provider, VaeltrixLabs Indonesian (Vaeltrix API), receives user-submitted content needed to process AI requests and return outputs. VaeltrixLabs Indonesian deletes user prompts after generating AI content and does not store them.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Logging/Analytics: Receives logs, diagnostics, usage events, and related identifiers needed for analytics and stability.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Authentication providers: Google and Apple process sign-in events and share authentication data per their platforms and your settings.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Advertising and Analytics Partners: We share certain automatically collected information with partners who help promote our Services. This allows us to display relevant advertisements on third-party platforms and analyze the performance and reach of our marketing campaigns.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Our affiliated companies. As a global company, the Service is supported by entities within our corporate group. These entities process data as needed for functions such as storage, content delivery, security, research and development, analytics, support, and content moderation, under intra-group agreements with data protection terms.</p>
<h3 style="margin:10px 0 3px;font-size:0.93rem;font-weight:600;">Legal, Safety, and Rights Protection</h3>
<p style="margin:3px 0 7px;line-height:1.52;">We may disclose your personal data if we believe it&#x27;s necessary to:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Comply with applicable laws, regulations, or valid legal process (such as a subpoena, court order, or search warrant).</p>
<p style="margin:3px 0 7px;line-height:1.52;">Protect the safety, rights, or property of the Company, our users, or the public.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Investigate, prevent, or take action regarding suspected fraud, abuse, security issues, or violations of our Terms of Service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Where permitted, we may notify you before responding to legal process, unless prohibited by law or court order.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">5. Corporate Transactions</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If we are involved in a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets, data may be transferred as part of that transaction, subject to appropriate protections.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">6. USE OF COOKIES AND SIMILAR TECHNOLOGIES</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We may use SDKs and similar technologies to support functionality, performance, and security. We use only technologies necessary to provide the Service, such as security, session management, and crash reporting. We do not use third-party tracking cookies for cross-site advertising.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">7. Data Retention</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We retain your personal data for as long as necessary to provide the Services. To determine the appropriate retention period, we consider the amount, nature, and sensitivity of your personal data, the potential risk of harm from unauthorized use or disclosure of your personal data, the purposes for which we process your personal data, whether we can achieve those purposes through other means, and the applicable legal requirements. We will also retain and use your personal data to the extent necessary to comply with our legal obligations, in accordance with applicable laws.</p>
<p style="margin:3px 0 7px;line-height:1.52;">We maintain retention schedules that specify retention periods (or the criteria used to determine such periods) by data category, and we delete or de-identify personal data when it is no longer needed for the purposes described in this Policy, unless retention is required or permitted by applicable laws.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">8. The Security Of Your Personal Data</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We implement reasonable administrative, technical, and physical safeguards designed to protect data from unauthorized access, use, or disclosure. No security measure is perfect; we cannot guarantee absolute security.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">9. Where We Store Your Personal Data</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Depending on your location and the features you use, your personal data may be transferred and processed outside your jurisdiction. We collect, process, and store your personal data in Singapore, which may have different data protection laws than your jurisdiction.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Where required, we will use appropriate safeguards for transferring Personal Data outside certain countries, including for one or more of the purposes set out in this Policy, and we will do so in accordance with the requirements of applicable data protection laws.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">10. The Personal Data relating to Children</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Our Services are intended for users 18 years of age or older and are not designed for minors under 18. We do not knowingly collect or maintain personal data from anyone under 18. We encourage parents and guardians to monitor their children’s internet use and instruct them not to share personal data through Vaeltrix without permission.</p>
<p style="margin:3px 0 7px;line-height:1.52;">If we learn we have collected personal data from a child under 13 without verified parental consent, we will delete it. If you believe we have data from or about a child under 13, please contact us at <code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrixteam@gmail.com</code>.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">11. Your Rights</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Depending on your state of residence, you may have certain rights regarding your personal data, which may include:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Right to Know/Access: Request a copy of the specific pieces and categories of personal data we have collected about you.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Right to Delete: Request deletion of your personal data, subject to certain legal exceptions. You can choose to delete your account on the app&#x27;s settings page.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Right to Correct: You can request correction of inaccurate personal data we maintain.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Right to Data Portability: If required by the laws of the country where you reside, you may have the right to request that your personal data be provided to you in a structured, commonly used, and machine-readable format, where feasible.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Right to Limit Use of Sensitive Personal Data: Request to limit the use and disclosure of your sensitive personal data to what is necessary to provide our services.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Right to Appeal: Appeal our decision if we decline to act on your request, where provided by applicable laws.</p>
<p style="margin:3px 0 7px;line-height:1.52;">You can exercise your data subject rights using the contact details provided in Article 13. We will respond within the timelines required by law.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Exercising these rights is generally free of charge. However, we may refuse to process requests that are manifestly unfounded or excessive, or charge a fee up to our actual costs, as permitted by law.</p>
<p style="margin:3px 0 7px;line-height:1.52;">To protect your data and our Services, we may need to verify your identity before processing your request. This may require additional data, such as your email address or, in limited cases, a government-issued ID. You may use an authorized agent, but we require proof of authorization and will still verify your identity. We will not discriminate against you for exercising your privacy rights.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">12. ADDITIONAL DATA SECURITY DETAILS</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We implement appropriate organizational and technical measures to protect your personal data. For instance, we limit access to your personal data to our employees, agents, contractors, and other third parties who require such access to carry out their duties and contractual obligations. We implement both physical access restrictions for our data centers and logical access controls for data and systems access.</p>
<p style="margin:3px 0 7px;line-height:1.52;">In addition, we implement appropriate access control measures to prevent unauthorized access, use, disclosure, modification, or disposal of the data we hold, and to maintain data accuracy, among other things. We will notify you and the regulatory authorities as required by applicable law in the event of a data breach incident.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">13. UPDATES</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We may update this Policy as laws and product features change. When we do, we will inform you as appropriate, depending on the significance of the changes and legal requirements. You may receive notifications about significant changes through channels such as Vaeltrix&#x27;s in-app messaging. We recommend checking the Policy regularly for updates. Please refer to the date at the top to see when it was last updated.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">14. CONTACT US</h2>
<p style="margin:3px 0 7px;line-height:1.52;">For questions, comments about this Policy, or requests to exercise your rights under applicable laws, contact our privacy team via:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Email: <code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">vaeltrix@gmail.com</code></p>
<p style="margin:3px 0 7px;line-height:1.52;">Contact Address: 51 BRAS BASAH ROAD #03-06 LAZADA ONE SINGAPORE 189554</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Jurisdiction-Specific Supplemental Terms</h2>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">BRAZIL</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you are a user located in Brazil, the following provisions apply to you in accordance with the Brazilian General Data Protection Law (LGPD) and other applicable regulations.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">1. Your Data Protection Rights</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We are committed to transparency and have established controls to ensure you can exercise your rights under the LGPD. You have the right to request:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Processing Confirmation： Confirmation that we are processing your personal data.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Access： A copy of the personal data we hold about you.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Correction： Rectification of any information that is incomplete, inaccurate, or out-of-date.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Anonymization or Deletion： The anonymization, blocking, or erasure of unnecessary or excessive data, or data processed in non-compliance with the LGPD.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Portability： The transfer of your data to another service provider, subject to regulatory requirements.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Objection： The right to object to processing activities that are not based on your consent should they fail to comply with the law.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Sharing Information： Information regarding the public and private entities with whom we share your data.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Consent Information： Details on the implications of withholding consent and the right to withdraw consent at any time.</p>
<p style="margin:3px 0 7px;line-height:1.52;">International Transfer Details： Further information on the safeguards used for cross-border data transfers (such as Standard Contractual Clauses).</p>
<p style="margin:3px 0 7px;line-height:1.52;">Review of Automated Decisions： For our AI-driven services, you may request a review of decisions made solely through automated processing that affect your interests, including those used to define personal or professional profiles.</p>
<p style="margin:3px 0 7px;line-height:1.52;">To exercise these rights, please get in touch with us via the <strong>“Contact Us”</strong> section. You also have the right to lodge a formal complaint with the National Data Protection Authority (ANPD).</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">2. Identity Verification</h2>
<p style="margin:3px 0 7px;line-height:1.52;">To protect your security and prevent unauthorized access, we may require specific information or documentation to verify your identity before responding to your request. Any data provided for this verification process will be used solely for authentication and handled in accordance with our security protocols.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">3. Limitations to Requests</h2>
<p style="margin:3px 0 7px;line-height:1.52;">In certain circumstances, we may be unable to fulfill your request. This may occur if fulfilling the request would compromise our trade secrets, violate intellectual property rights, or interfere with our legal and regulatory obligations. We may also retain data as necessary to defend our rights in legal disputes. If we deny a request, we will provide a transparent explanation of the legal or factual reasons for our decision.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">4. Global Data Transfers and Protection</h2>
<p style="margin:3px 0 7px;line-height:1.52;">To operate our global AI infrastructure, we must transfer your data to internal and external recipients located outside of Brazil.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Storage &amp; Affiliates: Your data may be stored on secure servers in countries including Singapore and shared within our Corporate Group.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Third Parties: We may share data with service providers or judicial/government authorities as described in this Policy.</p>
<p style="margin:3px 0 7px;line-height:1.52;">To ensure your data remains protected regardless of location, we implement:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Technical Safeguards： Data encryption (at rest and in transit), activity logging, and strict role-based access controls.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Organizational Measures： Internal privacy policies, mandatory employee training, and rigorous information security audits.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">Indonesia</h2>
<p style="margin:3px 0 7px;line-height:1.52;">If you are a user located in Indonesia, the following provisions apply to you in accordance with theNo 27 of 2022 on Personal Data Protection and other applicable regulations.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">1. Age Requirements and Guardian Consent</h2>
<p style="margin:3px 0 7px;line-height:1.52;">By accessing the Services, you confirm that you are at least 18 years of age. If you are under 18 and not legally emancipated, you must obtain prior consent from your parent or legal guardian. In such cases, the parent or guardian is responsible for: (i) supervising your use of the Services; (ii) ensuring your compliance with this Policy; and (iii) guaranteeing that your activities do not violate child protection laws. If parental consent is not provided or if your guardian does not wish to manage the account, you must stop using the Services immediately.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">2. Your Data Rights and Choices</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Upon your request, we will facilitate the disclosure or transfer of your personal data to designated third parties. You may withdraw this consent at any time. Additionally, you have the right to request: (i) access to your historical personal data; and (ii) the erasure of your data from our systems. Please be aware that deleting your data or withdrawing consent may restrict your access to certain features of Vaeltrix. To exercise these rights, please get in touch with us via the details in the <strong>“Contact Us”</strong> section.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">3. Breach Notification</h2>
<p style="margin:3px 0 7px;line-height:1.52;">Should a security breach affect your personal data, we will promptly notify you and provide relevant details about the incident.</p>
<h2 style="margin:14px 0 5px;font-size:1.05rem;font-weight:700;color:var(--blue);border-bottom:1px solid var(--glass-border);padding-bottom:2px;">4. Data Retention and Anonymization</h2>
<p style="margin:3px 0 7px;line-height:1.52;">We retain your personal data only for as long as necessary to provide the Services or for legitimate business purposes. We may store specific data for five (1) years (or longer if legally required) to comply with regulatory obligations or for legal defense. Following this period or upon service termination, your data will be aggregated and anonymized. Non-personally identifiable data may be kept indefinitely for analytical purposes.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Philippines:</p>
<p style="margin:3px 0 7px;line-height:1.52;">If you are a user located in the Philippines, the following provisions apply to you in accordance with the No 27 of 2022 on Personal Data Protection and other applicable regulations.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Under the Philippine Data Privacy Act, you are entitled to specific protections regarding your information. You have the right to:</p>
<p style="margin:3px 0 7px;line-height:1.52;">Stay Informed： Know how your data is being processed.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Object： Disagree with certain types of data handling.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Access &amp; Portability： Request a copy of your data or move it to another service.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Correct &amp; Erase： Update inaccuracies or request the deletion/blocking of your information.</p>
<p style="margin:3px 0 7px;line-height:1.52;">Seek Redress： File a complaint with the National Privacy Commission (NPC) or claim damages for privacy violations.</p>
<p style="margin:3px 0 7px;line-height:1.52;">To keep your account secure, we will ask you to verify your identity or provide account details before we process your request.</p>`
  },
  cookie: {
    title: "Cookie Notice",
    body: `<p style="margin:4px 0 8px;line-height:1.55;">VaeltrixAI hanya menggunakan <strong>1 jenis cookie</strong>: cookie sesi login (<code style="font-size:0.88em;background:rgba(128,128,128,0.15);padding:1px 5px;border-radius:4px;">httpOnly</code>) untuk menjaga kamu tetap login dengan aman.</p>
<p style="margin:4px 0 8px;line-height:1.55;">Cookie ini bersifat <strong>fungsional</strong> — dibutuhkan supaya fitur login &amp; sync cloud bisa jalan, dan <strong>tidak dipakai</strong> untuk iklan, pelacakan pihak ketiga, atau profiling.</p>
<p style="margin:4px 0 8px;line-height:1.55;">Kalau kamu tidak login (mode tamu / BYOK), <strong>tidak ada cookie</strong> yang dipakai sama sekali — semua data hanya tersimpan lokal di perangkat kamu.</p>`
  },
  contact: {
    title: "Contact Us",
    body: `<p style="margin:4px 0 8px;line-height:1.55;">Ada pertanyaan, laporan bug, atau masukan untuk VaeltrixAI?</p>
<p style="margin:8px 0 4px;line-height:1.55;">Hubungi kami lewat email:</p>
<p style="margin:6px 0;"><code style="font-size:0.95em;background:rgba(128,128,128,0.18);padding:5px 10px;border-radius:7px;display:inline-block;">vaeltrixteam@gmail.com</code></p>
<p style="margin:10px 0 0;line-height:1.55;opacity:0.8;">Kami berusaha membalas secepat mungkin.</p>`
  },
};

function openLegalModal(type) {
  const content = VX_LEGAL_CONTENT[type];
  if (!content) return;
  document.getElementById("legal-modal-title").textContent = content.title;
  const bodyEl = document.getElementById("legal-modal-body");
  bodyEl.innerHTML = content.body;
  bodyEl.scrollTop = 0;
  document.getElementById("legal-modal").style.display = "flex";
}
function closeLegalModal() { document.getElementById("legal-modal").style.display = "none"; }

function confirmDeleteAllChats() {
  if (!confirm("Yakin Mau Hapus SEMUA Percakapan Di Perangkat Ini? Percakapan Yang Sudah Ke-sync Ke Cloud TIDAK Ikut Terhapus Dari Server.")) return;
  sessions.length = 0;
  currentSession = null;
  saveSessions();
  if (typeof renderHistory === "function") renderHistory();
  if (typeof newChat === "function") newChat();
  closeSettingsModal();
  if (typeof showToast === "function") showToast("Semua Percakapan Lokal Dihapus.");
}
function checkForUpdates() { showToast("Kamu Sudah Pakai Versi Terbaru VaeltrixAI (1.8.0-x-release)"); }

// ---- Generic Option Picker (dipakai Play Voice / Theme / Font Size / Language) ----
function openOptionPicker(kind) {
  const title = document.getElementById("option-picker-title");
  const sub = document.getElementById("option-picker-sub");
  const list = document.getElementById("option-picker-list");
  list.innerHTML = "";
  let options = [];

  if (kind === "theme") {
    title.textContent = "PENGATURAN TEMA";
    sub.textContent = "Pilih Tampilan VaeltrixAI Kamu.";
    options = [
      { value: "auto", label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg>Auto (Ikut Sistem)', active: getTheme() === "auto" },
      { value: "dark", label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Dark', active: getTheme() === "dark" },
      { value: "light", label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>Light', active: getTheme() === "light" }
    ];
  } else if (kind === "font") {
    title.textContent = "FONT SIZE";
    sub.textContent = "Atur Ukuran Teks Chat Biar Nyaman Dibaca.";
    options = [
      { value: "small", label: "Small", active: getFontSize() === "small" },
      { value: "standard", label: "Standard", active: getFontSize() === "standard" },
      { value: "large", label: "Large", active: getFontSize() === "large" }
    ];
  } else if (kind === "effort") {
    title.textContent = "UPAYA";
    sub.textContent = "Seberapa Dalam Vaeltrix Mikir Sebelum Jawab. Makin Tinggi, Makin Lambat Tapi Lebih Teliti.";
    options = [
      { value: "auto", label: "Otomatis — Vaeltrix Nyesuain Sendiri Ke Beratnya Pertanyaan (Disarankan)", active: getEffort() === "auto" },
      { value: "low", label: "Rendah — Balasan Cepat Buat Pertanyaan Sederhana", active: getEffort() === "low" },
      { value: "medium", label: "Sedang — Seimbang Buat Percakapan Sehari-Hari", active: getEffort() === "medium" },
      { value: "high", label: "Tinggi — Mikir Lebih Dalam, Cocok Buat Soal Rumit", active: getEffort() === "high" }
    ];
  } else if (kind === "lang") {
    title.textContent = "LANGUAGE";
    sub.textContent = "Bahasa Jawaban Vaeltrix (Bukan Bahasa Tampilan Aplikasi).";
    const globeSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    options = [
      { value: "id", label: globeSvg + "Indonesia", active: getLanguage() === "id" },
      { value: "en", label: globeSvg + "English", active: getLanguage() === "en" }
    ];
  } else if (kind === "voice") {
    title.textContent = "PLAY VOICE";
    const micSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-2px;margin-right:6px;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>';
    if (getVoiceProvider() === "elevenlabs") {
      sub.textContent = getElevenLabsKey()
        ? "Suara ElevenLabs (Lebih Natural). Butuh API Key & Kredit — Isi/Cek Di Custom API Keys."
        : "API Key ElevenLabs Belum Diisi — Buka Custom API Keys Dulu, Kalau Kosong Otomatis Balik Ke Suara Browser.";
      options = ELEVENLABS_VOICES.map(v => ({
        value: "el:" + v.id,
        label: (v.gender === "f" ? "♀ " : "♂ ") + `<b>${v.name}</b> — ${v.desc}`,
        active: getElevenLabsVoiceId() === v.id
      }));
      options.push({ value: "__switch_browser__", label: micSvg + "Balik Ke Suara Browser (Gratis)", active: false });
    } else {
      sub.textContent = "Pilih Suara Buat Fitur Baca-Kan Jawaban (Text-To-Speech).";
      const voices = ("speechSynthesis" in window) ? speechSynthesis.getVoices() : [];
      const idVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith("id"));
      const shown = (idVoices.length ? idVoices : voices).slice(0, 12);
      options = [{ value: "", label: "Default (Otomatis)", active: !getVoiceURI() }];
      shown.forEach(v => options.push({ value: v.voiceURI, label: `${v.name} (${v.lang})`, active: getVoiceURI() === v.voiceURI }));
      if (!voices.length) sub.textContent = "Daftar Suara Browser Kamu Belum Siap. Coba Buka Lagi Sebentar.";
      options.push({ value: "__switch_elevenlabs__", label: micSvg + "Coba Suara ElevenLabs (Lebih Natural)", active: false });
    }
  } else if (kind === "folder") {
    title.textContent = "PINDAH KE FOLDER";
    sub.textContent = "Kelompokkan Chat Ini Biar Sidebar Lebih Rapi.";
    const s = sessions.find(s => s.id === folderPickerTargetId);
    const current = s?.folder || "";
    options = [{ value: "__none__", label: "Tanpa Folder", active: !current }];
    vaeltrixFolders.forEach(f => options.push({ value: f, label: escHtml(f), active: current === f }));
  }

  options.forEach(o => {
    const btn = document.createElement("button");
    btn.className = "panel-btn blue";
    btn.style.cssText = "width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;" +
      (o.active ? "border-color:var(--blue);background:rgba(128,128,128,0.18);" : "");
    btn.innerHTML = `<span>${o.label}</span>` + (o.active ? '<span style="color:var(--blue);display:inline-flex;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : "");
    btn.onclick = () => selectOption(kind, o.value);
    list.appendChild(btn);
  });

  if (kind === "folder") {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:4px;";
    row.innerHTML = `<input type="text" class="panel-input" id="new-folder-input" placeholder="Nama Folder Baru..." style="margin:0;flex:1;">
      <button class="panel-btn blue" style="width:auto;padding:0 14px;" onclick="createFolderFromPicker()">+</button>`;
    list.appendChild(row);
    row.querySelector("input").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); createFolderFromPicker(); } });
  }

  document.getElementById("option-picker-backdrop").classList.add("show");
}
function closeOptionPicker() { document.getElementById("option-picker-backdrop").classList.remove("show"); }
function selectOption(kind, value) {
  if (kind === "theme") {
    applyTheme(value);
    document.getElementById("settings-val-theme").textContent = getThemeLabel(value);
    showToast(value === "light" ? "Tema Terang Aktif" : value === "auto" ? "Tema Auto Aktif (Ikut Sistem)" : "Tema Gelap Aktif");
  } else if (kind === "font") {
    applyFontSize(value);
    document.getElementById("settings-val-font").textContent = getFontSizeLabel();
    showToast("Ukuran Font Diubah Ke " + getFontSizeLabel());
  } else if (kind === "effort") {
    applyEffort(value);
    document.getElementById("settings-val-effort").textContent = getEffortLabel();
    const modeSheetEffortEl = document.getElementById("mode-sheet-effort-val");
    if (modeSheetEffortEl) modeSheetEffortEl.textContent = getEffortLabel();
    showToast("Upaya Vaeltrix Diubah Ke " + getEffortLabel());
  } else if (kind === "lang") {
    applyLanguage(value);
    document.getElementById("settings-val-lang").textContent = value === "en" ? "English" : "Indonesia";
    showToast(value === "en" ? "Vaeltrix Akan Jawab Pakai Bahasa Inggris" : "Vaeltrix Akan Jawab Pakai Bahasa Indonesia");
  } else if (kind === "voice") {
    if (value === "__switch_elevenlabs__" || value === "__switch_browser__") {
      setVoiceProvider(value === "__switch_elevenlabs__" ? "elevenlabs" : "browser");
      document.getElementById("settings-val-voice").textContent = getVoiceLabel();
      openOptionPicker("voice"); // refresh isi picker ke provider baru, jangan ditutup dulu
      return;
    } else if (value.startsWith("el:")) {
      localStorage.setItem("vaeltrix_elevenlabs_voice_id", value.slice(3));
    } else {
      localStorage.setItem("vaeltrix_voice_uri", value);
    }
    document.getElementById("settings-val-voice").textContent = getVoiceLabel();
    showToast("Voice Diganti Ke " + getVoiceLabel());
  } else if (kind === "folder") {
    const s = sessions.find(s => s.id === folderPickerTargetId);
    if (s) {
      s.folder = value === "__none__" ? null : value;
      saveSessions(); renderHistory();
      showToast(value === "__none__" ? "Folder Dilepas" : `Dipindah Ke Folder "${value}"`);
    }
  }
  closeOptionPicker();
}
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => { /* daftar suara siap dipakai saat Play Voice dibuka */ };
}

// ============ PLAN UI ============
function updatePlanUI() {
  const badge = document.getElementById("plan-badge");
  const label = document.getElementById("plan-label");
  const icon = document.getElementById("plan-badge-icon");
  if (isPremium) {
    badge.className = "plan-badge premium";
    label.innerHTML = "<b>Premium</b>";
    if (icon) icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    document.getElementById("input-hint").textContent = "Vaeltrix Premium · Semua Fitur Aktif";
  } else {
    badge.className = "plan-badge free";
    label.innerHTML = "<b>Free Plans</b>";
    if (icon) icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    document.getElementById("input-hint").textContent = "Vaeltrix Adalah AI. Dan Bisa Keliru Periksa Kembali Respons Nya.";
  }
}

function updateCounter() {
  const el = document.getElementById("chat-counter");
  // Dulu: Premium gak ditampilin sama sekali (karena unlimited). Sekarang Premium juga
  // punya limit (60/jam), jadi tetep ditampilin biar user premium tau sisa kuotanya juga.
  const limit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
  const rem = Math.max(0, limit - freeCount);
  el.className = rem <= 3 ? "warn" : "";
  el.innerHTML = `Sisa Chat ${isPremium ? "Premium" : "Gratis"}: <span>${rem}</span>/${limit} <span class="reset-note">&middot; Reset ${formatResetCountdown()}</span>`;
}

// ============ USAGE-BASED FREE TIER RESET ============
function initResetTimer() {
  const now = Date.now();
  if (!resetAt || now >= resetAt) {
    resetAt = now + 60 * 60 * 1000; // Direset dari 24 jam -> 1 jam sesuai request
    freeCount = 0;
    localStorage.setItem("vaeltrix_reset_at", resetAt);
    localStorage.setItem("vaeltrix_free_count", "0");
  }
  if (resetTimerHandle) clearInterval(resetTimerHandle);
  resetTimerHandle = setInterval(() => {
    if (Date.now() >= resetAt) initResetTimer();
    // Cek juga kalau trial referral premium sudah habis masanya
    const stillPremium = isPremiumActive();
    if (stillPremium !== isPremium) {
      isPremium = stillPremium;
      updatePlanUI();
      if (!isPremium) showToast("Masa Trial Premium Kamu Sudah Berakhir.");
    }
    updateCounter();
  }, 60 * 1000);
}

function formatResetCountdown() {
  const ms = Math.max(0, resetAt - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h <= 0 && m <= 0) return "Sebentar Lagi";
  if (h <= 0) return `Dalam ${m}M`;
  return `Dalam ${h}j ${m}M`;
}


// ============ API KEY ============
function saveApiKey() {
  const val = document.getElementById("api-key-input").value.trim();
  const st  = document.getElementById("api-status");
  if (val) { localStorage.setItem("vaeltrix_user_key", val); st.textContent = "Gemini Key Tersimpan!"; st.style.color = "#4ade80"; }
  else     { localStorage.removeItem("vaeltrix_user_key");    st.textContent = "Gemini Key Dihapus."; st.style.color = "var(--muted)"; }
  setTimeout(() => st.textContent = "", 2500);
}

function saveGroqKey() {
  const val = document.getElementById("groq-key-input").value.trim();
  const st  = document.getElementById("api-status");
  if (val) { localStorage.setItem("vaeltrix_groq_key", val); st.textContent = "Groq Key Tersimpan!"; st.style.color = "#4ade80"; }
  else     { localStorage.removeItem("vaeltrix_groq_key");    st.textContent = "Groq Key Dihapus."; st.style.color = "var(--muted)"; }
  setTimeout(() => st.textContent = "", 2500);
}

function saveTavilyKey() {
  const val = document.getElementById("tavily-key-input").value.trim();
  const st  = document.getElementById("api-status");
  if (val) { localStorage.setItem("vaeltrix_tavily_key", val); st.textContent = "Tavily Key Tersimpan!"; st.style.color = "#4ade80"; }
  else     { localStorage.removeItem("vaeltrix_tavily_key");    st.textContent = "Tavily key dihapus, pakai DuckDuckGo aja."; st.style.color = "var(--muted)"; }
  setTimeout(() => st.textContent = "", 2500);
}

// v1.8.0 — OpenRouter itu provider OPSIONAL (lihat RULE 3 di spec upgrade: gak ada backend di
// rilis ini, jadi gak ada cara aman naro shared/default key — SENGAJA gak ada default key kayak
// Gemini/Groq/Tavily). Cuma kepake sebagai fallback TERAKHIR di callGemini() (07-providers.js)
// kalau Gemini DAN Groq dua-duanya udah gagal total, DAN cuma kalau field ini diisi sendiri.
function saveOpenRouterKey() {
  const val = document.getElementById("openrouter-key-input").value.trim();
  const st  = document.getElementById("api-status");
  if (val) { localStorage.setItem("vaeltrix_openrouter_key", val); st.textContent = "OpenRouter Key Tersimpan!"; st.style.color = "#4ade80"; }
  else     { localStorage.removeItem("vaeltrix_openrouter_key"); st.textContent = "OpenRouter Key Dihapus."; st.style.color = "var(--muted)"; }
  setTimeout(() => st.textContent = "", 2500);
}

function saveElevenLabsKey() {
  const val = document.getElementById("elevenlabs-key-input").value.trim();
  const st  = document.getElementById("api-status");
  if (val) { localStorage.setItem("vaeltrix_elevenlabs_key", val); st.textContent = "ElevenLabs Key Tersimpan!"; st.style.color = "#4ade80"; }
  else     { localStorage.removeItem("vaeltrix_elevenlabs_key"); st.textContent = "ElevenLabs Key Dihapus, Play Voice Balik Ke Browser."; st.style.color = "var(--muted)"; }
  setTimeout(() => st.textContent = "", 3000);
}

function savePollinationsKey() {
  const val = document.getElementById("pollinations-key-input").value.trim();
  const st  = document.getElementById("api-status");
  if (val && val.startsWith("sk_")) {
    // Key sk_ (secret) sengaja ditolak di sini — itu buat backend, kalau nempel di app client-side
    // kayak gini bisa disedot siapa aja lewat View Source, persis kasus DEFAULT_KEY/GROQ_KEY yang lama.
    st.textContent = "Jangan Pakai Key sk_ Di Sini, Pakai Yang pk_ (Publishable)."; st.style.color = "var(--danger)";
  } else if (val) {
    localStorage.setItem("vaeltrix_pollinations_key", val); st.textContent = "Pollinations Key Tersimpan!"; st.style.color = "#4ade80";
  } else {
    localStorage.removeItem("vaeltrix_pollinations_key"); st.textContent = "Pollinations Key Dihapus."; st.style.color = "var(--muted)";
  }
  setTimeout(() => st.textContent = "", 3000);
}

// ============ PREMIUM ============
function openPremiumModal() {
  document.getElementById("premium-modal").classList.add("show");
  document.getElementById("modal-error").textContent = "";
  document.getElementById("premium-code-input").value = "";
  if (!isDesktopLayout()) closeSidebar();
  setTimeout(() => document.getElementById("premium-code-input").focus(), 350);
}
function closePremiumModal() { document.getElementById("premium-modal").classList.remove("show"); }

async function activatePremium() {
  const code  = document.getElementById("premium-code-input").value.trim().toUpperCase();
  const errEl = document.getElementById("modal-error");
  if (!code) { errEl.textContent = "Please Input Your Code For Acces Premium Plans."; return; }

  const showBadCode = (msg) => {
    errEl.textContent = msg;
    const inp = document.getElementById("premium-code-input");
    inp.style.borderColor = "rgba(255,100,100,0.6)";
    setTimeout(() => inp.style.borderColor = "", 1500);
  };

  // FIX KEAMANAN: PREMIUM_CODES di bawah cuma di-obfuscate XOR, gampang dibaca
  // siapa aja lewat devtools -- gak pernah beneran rahasia. Buat user yang
  // login lewat Akun VaeltrixLabs, validasi WAJIB lewat backend (source of
  // truth tier yang beneran dipakai buat gating model premium di jalur chat
  // backend). Guest (belum login) gak punya sesi server buat digantungin tier,
  // jadi tetap jalur lokal seperti sebelumnya -- ini cuma ngatur limit/mode di
  // browser sendiri, gak pernah nyentuh model/kuota berbayar milik platform.
  if (typeof isVaeltrixLoggedIn === "function" && isVaeltrixLoggedIn()) {
    try {
      const data = await vaeltrixApiFetch("/account/redeem-code", { method: "POST", body: { code } });
      isPremium = true;
      localStorage.setItem("vaeltrix_premium", "true");
      if (typeof vxUser !== "undefined" && vxUser) vxUser.tier = data.tier;
      closePremiumModal();
      updatePlanUI();
      updateCounter();
      showToast("Premium Aktif! Welcome.", false);
    } catch (e) {
      showBadCode(e.message || "Kode Salah Atau Sudah Kadaluarsa");
    }
    return;
  }

  if (PREMIUM_CODES.map(c => c.toUpperCase()).includes(code)) {
    isPremium = true;
    localStorage.setItem("vaeltrix_premium", "true");
    closePremiumModal();
    updatePlanUI();
    updateCounter();
    showToast("Premium Aktif! Welcome.", false);
  } else {
    showBadCode("Kode Salah Atau Sudah Kadaluarsa");
  }
}


