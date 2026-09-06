// VaeltrixAI — 17-account.js
// ================================================================
// Phase 3 (Account + Cloud Sync) — BAGIAN AWAL: jembatan login ke VaeltrixLabs.
// ================================================================
// Ini BUKAN full Phase 3. Cakupan file ini SENGAJA dibatasi ke:
//   - Register / Login / Logout lewat backend VaeltrixLabs
//   - Nyimpen access token (di MEMORY, bukan localStorage -- lebih tahan XSS,
//     konsisten sama pola yang sudah dipakai situs Platform)
//   - Silent refresh pas app dibuka (baca refresh token dari httpOnly cookie)
//   - Update UI kecil (settings row + modal)
//
// BELUM dikerjakan di sini (lihat laporan Phase 3 -- ini scope lanjutan):
//   - Sinkron conversations/projects/memory/settings lokal ke backend
//   - Migrasi histori localStorage lama (section 36)
//   - OAuth (Google/GitHub) -- backend sudah punya endpoint-nya, tapi butuh
//     halaman/route "/auth/callback" yang app statis ini belum punya
//   - Reset password / verifikasi email dari dalam app ini
//
// Begitu login berhasil di sini, getVaeltrixBackendToken() di 07-providers.js
// otomatis mulai return token asli -- jalur chat backend Phase 2 yang tadinya
// dormant otomatis aktif TANPA perlu ubah apa-apa lagi di providers.js/chat-core.js.

// ---- State (in-memory saja, sengaja TIDAK localStorage) ----
let vxAccessToken = null;
let vxUser = null; // { id, email, name, tier, ... } -- bentuk persis dari toSafeUser() backend
let vxAccountFormMode = "login"; // "login" | "register"
let vxRefreshTimer = null;

function getVaeltrixAccessToken() {
  return vxAccessToken;
}
function getVaeltrixUser() {
  return vxUser;
}
function isVaeltrixLoggedIn() {
  return !!vxAccessToken;
}

// ---- Network helper kecil, konsisten sama pola error backend yang lain ----
async function vxAuthFetch(path, body) {
  const res = await fetch(`${VAELTRIX_BACKEND_BASE}/api/v1/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // WAJIB -- biar cookie refresh token (httpOnly) ikut terkirim/tersimpan
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* body kosong, mis. beberapa response sukses tanpa isi */ }
  if (!res.ok) {
    const msg = json?.error?.message || "Gagal Koneksi Ke Server Utama.";
    const err = new Error(msg);
    err.code = json?.error?.code;
    throw err;
  }
  return json?.data ?? json; // ok()/created() helper backend bungkus dalam {success,data}
}

// ---- Silent refresh: dipanggil sekali pas app dibuka, dan berkala selama login ----
async function vaeltrixSilentRefresh() {
  try {
    const data = await vxAuthFetch("/refresh");
    vxAccessToken = data.accessToken;
    vxUser = data.user;
    startVaeltrixRefreshTimer();
  } catch (e) {
    // Wajar buat user yang belum pernah login / cookie sudah expired -- BUKAN error
    // yang perlu ditampilin ke user, diam-diam aja tetap di state logged-out.
    vxAccessToken = null;
    vxUser = null;
  }
  updateAccountUI();
}

// ---- Helper generik buat endpoint terautentikasi LAIN (bukan /auth/*), dipakai 18-cloud-sync.js.
// Beda dari vxAuthFetch di atas: ini pakai header Authorization Bearer (bukan cookie), method
// bebas, dan body opsional -- pola yang sama kayak callVaeltrixBackend() di 07-providers.js.
async function vaeltrixApiFetch(path, options = {}) {
  const token = getVaeltrixAccessToken();
  if (!token) throw new Error("Belum Login.");
  const res = await fetch(`${VAELTRIX_BACKEND_BASE}/api/v1${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* mis. 204 No Content pas delete -- wajar kosong */ }
  if (!res.ok) {
    const err = new Error(json?.error?.message || "Server Sedang Gangguan, Coba Lagi Nanti.");
    err.code = json?.error?.code;
    throw err;
  }
  return json?.data ?? json;
}

function startVaeltrixRefreshTimer() {
  if (vxRefreshTimer) clearInterval(vxRefreshTimer);
  // Phase 3 -- begitu kebukti login/refresh berhasil, tarik daftar percakapan dari backend
  // (18-cloud-sync.js, load setelah file ini). Guard typeof supaya file ini tetap aman berdiri
  // sendiri kalau suatu saat 18-cloud-sync.js gak ke-load (mis. di-skip dari index.html).
  if (typeof vaeltrixSyncConversationList === "function") vaeltrixSyncConversationList();
  if (typeof vaeltrixSyncProjectList === "function") vaeltrixSyncProjectList();
  if (typeof vaeltrixSyncSettingsFromCloud === "function") vaeltrixSyncSettingsFromCloud();
  // Profil lokal (nama/foto/username di 04-settings.js, dipakai avatar+sapaan
  // app) ikut nama akun begitu login -- akun jadi source of truth buat "name"
  // pas login, sinkron sama arah sebaliknya di saveProfile() (dorong ke
  // backend pas nama diedit manual). Foto & username TETAP lokal-only --
  // gak ada kolom untuk itu di backend.
  if (vxUser?.name && typeof getProfile === "function" && typeof saveProfileData === "function") {
    const localProfile = getProfile();
    if (localProfile.name !== vxUser.name) {
      localProfile.name = vxUser.name;
      saveProfileData(localProfile);
    }
  }
  // Access token umur 15 menit (backend: JWT_ACCESS_TTL) -- refresh tiap 12 menit,
  // kasih jeda aman 3 menit sebelum bener-bener expired.
  vxRefreshTimer = setInterval(async () => {
    try {
      const data = await vxAuthFetch("/refresh");
      vxAccessToken = data.accessToken;
      vxUser = data.user;
    } catch (e) {
      // Refresh gagal di tengah sesi (mis. token dicabut/expired) -- logout diam-diam,
      // biar jalur chat balik ke BYOK lama alih-alih terus gagal pakai token basi.
      vxAccessToken = null;
      vxUser = null;
      clearInterval(vxRefreshTimer);
      updateAccountUI();
    }
  }, 12 * 60 * 1000);
}

async function vaeltrixLogin(email, password) {
  const data = await vxAuthFetch("/login", { email, password });
  vxAccessToken = data.accessToken;
  vxUser = data.user;
  startVaeltrixRefreshTimer();
  updateAccountUI();
}

async function vaeltrixRegister(email, password, name) {
  const data = await vxAuthFetch("/register", { email, password, name: name || undefined });
  vxAccessToken = data.accessToken;
  vxUser = data.user;
  startVaeltrixRefreshTimer();
  updateAccountUI();
}

async function vaeltrixLogout() {
  try { await vxAuthFetch("/logout"); } catch (e) { /* tetep lanjut clear state lokal walau request gagal */ }
  vxAccessToken = null;
  vxUser = null;
  if (vxRefreshTimer) clearInterval(vxRefreshTimer);
  updateAccountUI();
  closeAccountModal();
  if (typeof showToast === "function") showToast("Berhasil Logout");
}

// ---- UI ----
function updateAccountUI() {
  const rowVal = document.getElementById("settings-val-account");
  if (rowVal) rowVal.innerHTML = isVaeltrixLoggedIn() ? `<b>${escapeHtmlVx(vxUser?.email || "Login")}</b>` : "<b>Belum Login</b>";

  const formView = document.getElementById("account-form-view");
  const loggedInView = document.getElementById("account-loggedin-view");
  const loggedInEmail = document.getElementById("account-loggedin-email");
  const uploadBtn = document.getElementById("account-upload-btn");
  if (formView && loggedInView) {
    if (isVaeltrixLoggedIn()) {
      formView.style.display = "none";
      loggedInView.style.display = "block";
      if (loggedInEmail) loggedInEmail.textContent = vxUser?.email || "";
      if (uploadBtn) {
        const count = typeof vaeltrixCountUnsyncedLocal === "function" ? vaeltrixCountUnsyncedLocal() : 0;
        if (count > 0) {
          uploadBtn.style.display = "block";
          uploadBtn.textContent = `Upload ${count} Percakapan/Project Lokal Ke Cloud`;
          uploadBtn.disabled = false;
        } else {
          uploadBtn.style.display = "none";
        }
      }
    } else {
      formView.style.display = "block";
      loggedInView.style.display = "none";
    }
  }
}

// Dipicu tombol di account-modal. proses satu-satu (bukan Promise.all) sengaja -- data lama bisa
// banyak, biar gak nembak puluhan request bersamaan ke server sekaligus.
async function startVaeltrixUploadLocalData() {
  const btn = document.getElementById("account-upload-btn");
  if (!btn || typeof vaeltrixUploadLocalData !== "function") return;
  btn.disabled = true;
  const total = typeof vaeltrixCountUnsyncedLocal === "function" ? vaeltrixCountUnsyncedLocal() : 0;
  let done = 0;
  btn.textContent = `Mengupload... (0/${total})`;
  const result = await vaeltrixUploadLocalData(() => {
    done++;
    btn.textContent = `Mengupload... (${done}/${total})`;
  });
  updateAccountUI();
  if (typeof showToast === "function") {
    showToast(result.failed > 0
      ? `${result.uploaded} Berhasil, ${result.failed} Gagal Diupload`
      : `${result.uploaded} Berhasil Diupload Ke Cloud`);
  }
}

// escape kecil buat email ke innerHTML (defense-in-depth, meski email dari respons backend sendiri)
function escapeHtmlVx(str) {
  const d = document.createElement("div");
  d.textContent = String(str ?? "");
  return d.innerHTML;
}

function openAccountModal() {
  document.getElementById("more-menu")?.classList.remove("open");
  // Section 29-38 master prompt: entry point login/register sekarang halaman
  // dedicated (/login), bukan modal ini lagi -- lihat #vx-auth-screen di
  // index.html + fungsi-fungsi vxAuth* di bawah file ini. Modal ini sekarang
  // MURNI buat account management (ganti password, billing, logout, hapus
  // akun) buat user yang SUDAH login.
  if (!isVaeltrixLoggedIn()) { window.location.href = "/login"; return; }
  const errEl = document.getElementById("account-modal-error");
  if (errEl) errEl.textContent = "";
  fetchAndRenderPlanInfo();
  const modal = document.getElementById("account-modal");
  if (modal) modal.style.display = "flex";
}

// Ambil tier & ringkasan usage -- dipanggil pas modal dibuka (bukan tiap updateAccountUI, biar
// gak nembak API tiap kali status login diperbarui, cuma pas user beneran mau liat).
async function fetchAndRenderPlanInfo() {
  const el = document.getElementById("account-plan-info");
  if (!el) return;
  el.textContent = "Memuat Info Paket...";
  const premiumBtn = document.getElementById("account-upgrade-premium-btn");
  const proBtn = document.getElementById("account-upgrade-pro-btn");
  const manageBtn = document.getElementById("account-manage-billing-btn");
  try {
    const [sub, usage] = await Promise.all([
      vaeltrixApiFetch("/billing/subscription"),
      vaeltrixApiFetch("/usage")
    ]);
    const tierLabel = { free: "Free", premium: "Premium", pro: "Pro" }[sub.tier] || sub.tier;
    const tokenLabel = (usage.totalTokens || 0).toLocaleString("id-ID");
    el.textContent = `Paket: ${tierLabel} · ${usage.totalRequests || 0} Request · ${tokenLabel} Token Terpakai`;

    // Tier 'free' -> tawarin upgrade. Tier berbayar -> tawarin kelola (batalkan/ganti kartu) lewat
    // portal Stripe, bukan tombol upgrade lagi (gak masuk akal nawarin upgrade ke paket yang sama).
    const isFree = sub.tier === "free";
    if (premiumBtn) premiumBtn.style.display = isFree ? "block" : "none";
    if (proBtn) proBtn.style.display = isFree ? "block" : "none";
    if (manageBtn) manageBtn.style.display = isFree ? "none" : "block";
  } catch (e) {
    el.textContent = ""; // gagal ambil bukan hal fatal -- modal tetap kepake normal tanpa info ini
    if (premiumBtn) premiumBtn.style.display = "none";
    if (proBtn) proBtn.style.display = "none";
    if (manageBtn) manageBtn.style.display = "none";
    console.warn("VaeltrixAI: gagal ambil info paket/usage.", e);
  }
}

// Redirect ke Stripe Checkout. CATATAN: begitu pembayaran selesai, Stripe balikin user ke situs
// Platform (bukan balik ke VaeltrixAI.html ini) -- itu konfigurasi return_url yang sudah ada di
// backend (billing.service.js), bukan sesuatu yang saya set di sini. Langganannya tetap ke-update
// benar lewat webhook terlepas dari itu, cuma perjalanan baliknya belum "mulus" ke app ini lagi.
async function startVaeltrixCheckout(tier) {
  const btn = document.getElementById(tier === "pro" ? "account-upgrade-pro-btn" : "account-upgrade-premium-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Membuka Halaman Pembayaran..."; }
  try {
    const data = await vaeltrixApiFetch("/billing/checkout", { method: "POST", body: { tier, returnUrl: window.location.href } });
    if (data.url) window.location.href = data.url;
  } catch (e) {
    if (typeof showToast === "function") showToast(e.message || "Gagal Membuka Checkout", true);
    if (btn) { btn.disabled = false; btn.textContent = tier === "pro" ? "Upgrade Ke Pro" : "Upgrade Ke Premium"; }
  }
}

async function openVaeltrixBillingPortal() {
  const btn = document.getElementById("account-manage-billing-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Membuka..."; }
  try {
    const data = await vaeltrixApiFetch("/billing/portal");
    if (data.url) window.location.href = data.url;
  } catch (e) {
    if (typeof showToast === "function") showToast(e.message || "Gagal Membuka Portal Billing", true);
    if (btn) { btn.disabled = false; btn.textContent = "Kelola Langganan"; }
  }
}
function closeAccountModal() {
  const modal = document.getElementById("account-modal");
  if (modal) modal.style.display = "none";
}

function toggleAccountFormMode() {
  vxAccountFormMode = vxAccountFormMode === "login" ? "register" : "login";
  const nameInput = document.getElementById("account-name-input");
  const submitBtn = document.getElementById("account-submit-btn");
  const toggleBtn = document.getElementById("account-toggle-mode-btn");
  const errEl = document.getElementById("account-modal-error");
  if (errEl) errEl.textContent = "";
  if (vxAccountFormMode === "register") {
    if (nameInput) nameInput.style.display = "block";
    if (submitBtn) submitBtn.textContent = "DAFTAR";
    if (toggleBtn) toggleBtn.textContent = "Sudah Punya Akun? Login Di Sini";
  } else {
    if (nameInput) nameInput.style.display = "none";
    if (submitBtn) submitBtn.textContent = "LOGIN";
    if (toggleBtn) toggleBtn.textContent = "Belum Punya Akun? Daftar Di Sini";
  }
}

async function submitAccountForm() {
  const email = document.getElementById("account-email-input")?.value.trim() || "";
  const password = document.getElementById("account-password-input")?.value || "";
  const name = document.getElementById("account-name-input")?.value.trim() || "";
  const errEl = document.getElementById("account-modal-error");
  const submitBtn = document.getElementById("account-submit-btn");
  const resendBtn = document.getElementById("account-resend-verification-btn");
  if (errEl) errEl.textContent = "";
  if (resendBtn) resendBtn.style.display = "none";

  if (!email || !password) {
    if (errEl) errEl.textContent = "Email Dan Password Wajib Diisi.";
    return;
  }

  const originalLabel = submitBtn?.textContent;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "MEMPROSES..."; }
  try {
    if (vxAccountFormMode === "register") {
      await vaeltrixRegister(email, password, name);
      if (typeof showToast === "function") showToast("Akun Dibuat, Login Berhasil");
    } else {
      await vaeltrixLogin(email, password);
      if (typeof showToast === "function") showToast("Login Berhasil");
    }
    closeAccountModal();
  } catch (e) {
    if (errEl) errEl.textContent = e.message || "Server Gagal, Coba Lagi.";
    if (resendBtn) resendBtn.style.display = e.code === "EMAIL_CONFIRMATION_REQUIRED" ? "block" : "none";
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
  }
}

async function resendVerificationEmail(emailInputId) {
  const email = document.getElementById(emailInputId || "account-email-input")?.value.trim() || "";
  if (!email) return;
  try {
    await vxAuthFetch("/resend-verification", { email });
    if (typeof showToast === "function") showToast("Email Verifikasi Dikirim Ulang, Cek Inbox Kamu.");
  } catch (e) {
    if (typeof showToast === "function") showToast("Gagal Kirim Ulang Email.", true);
  }
}

function toggleChangePasswordView() {
  const view = document.getElementById("account-change-password-view");
  if (view) view.style.display = view.style.display === "none" ? "block" : "none";
}

async function submitChangePassword() {
  const currentPassword = document.getElementById("current-password-input")?.value || "";
  const newPassword = document.getElementById("new-password-input")?.value || "";
  const errEl = document.getElementById("change-password-error");
  if (errEl) errEl.textContent = "";
  if (!currentPassword || !newPassword) {
    if (errEl) errEl.textContent = "Password Saat Ini Dan Password Baru Wajib Diisi.";
    return;
  }
  if (newPassword.length < 8) {
    if (errEl) errEl.textContent = "Password Baru Minimal 8 Karakter.";
    return;
  }
  try {
    await vaeltrixApiFetch("/account/change-password", { method: "POST", body: { currentPassword, newPassword } });
    if (typeof showToast === "function") showToast("Password Berhasil Diganti.");
    document.getElementById("current-password-input").value = "";
    document.getElementById("new-password-input").value = "";
    toggleChangePasswordView();
  } catch (e) {
    if (errEl) errEl.textContent = e.message || "Gagal Ganti Password.";
  }
}

async function confirmDeleteAccount() {
  if (!confirm("Yakin Mau Hapus Akun? Semua Percakapan Dan Project Yang Tersimpan Di Cloud Akan Hilang Permanen Dan TIDAK BISA Dikembalikan.")) return;
  try {
    await vaeltrixApiFetch("/account", { method: "DELETE" });
    if (typeof showToast === "function") showToast("Akun Berhasil Dihapus.");
    vxAccessToken = null;
    vxUser = null;
    if (vxRefreshTimer) clearInterval(vxRefreshTimer);
    updateAccountUI();
    closeAccountModal();
  } catch (e) {
    if (typeof showToast === "function") showToast(e.message || "Gagal Hapus Akun.", true);
  }
}

function startVaeltrixOAuth(provider) {
  // Backend yang redirect ke Supabase (bukan frontend langsung) -- konsisten
  // sama arsitektur same-origin, frontend gak pernah perlu tau SUPABASE_URL.
  window.location.href = `${VAELTRIX_BACKEND_BASE}/api/v1/auth/oauth/${provider}`;
}

async function handleOAuthCallbackIfPresent() {
  if (window.location.pathname !== "/auth/callback") return false;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const oauthError = params.get("error_description") || params.get("error");
  // Bersihin URL SEGERA -- token di fragment gak boleh nangkring lama di
  // address bar/history walau gak pernah dikirim ke server manapun.
  window.history.replaceState({}, document.title, "/");

  if (oauthError) {
    if (typeof showToast === "function") showToast("Login OAuth Gagal: " + oauthError, true);
    return true;
  }
  if (!accessToken || !refreshToken) return false;

  try {
    const data = await vxAuthFetch("/oauth-callback", { accessToken, refreshToken });
    vxAccessToken = data.accessToken;
    vxUser = data.user;
    startVaeltrixRefreshTimer();
    if (typeof showToast === "function") showToast("Login Berhasil");
  } catch (e) {
    if (typeof showToast === "function") showToast("Gagal Login Lewat OAuth: " + (e.message || ""), true);
  }
  updateAccountUI();
  return true;
}

// ================================================================
// Halaman Auth Dedicated (/login /register /forgot-password /reset-password
// /auth/callback) -- section 29-38 master prompt. Ini LAPISAN TAMPILAN baru
// di atas fungsi login/register/OAuth yang SUDAH ADA di atas (vaeltrixLogin,
// vaeltrixRegister, startVaeltrixOAuth, handleOAuthCallbackIfPresent) --
// logic intinya TETAP dipakai apa adanya, cuma dipanggil dari form baru.
// Markup-nya ada di index.html (#vx-auth-screen), CSS-nya di css/auth.css.
// ================================================================

const VX_AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"];
let vxResetPasswordToken = null;

function vxAuthShowView(viewId) {
  ["vx-view-login", "vx-view-register", "vx-view-forgot", "vx-view-forgot-sent",
   "vx-view-reset", "vx-view-reset-invalid", "vx-view-oauth-loading"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === viewId ? "block" : "none";
  });
}

function vxAuthExtractHashToken() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  return new URLSearchParams(hash).get("access_token");
}

// Dipanggil sekali di awal boot. Sembunyi/tampil layar auth vs app utama sendiri
// sudah dihandle CSS (selector html.vx-auth-route, lihat inline script di <body>
// index.html) -- tugas fungsi ini cuma nentuin VIEW mana yang harus kelihatan.
// Balikin true kalau ini memang salah satu halaman auth (biar boot init lain di
// bawah gak usah jalan lagi buat halaman-halaman ini).
async function vxAuthBoot() {
  const path = window.location.pathname;
  if (!VX_AUTH_ROUTES.includes(path)) return false;

  if (path === "/auth/callback") {
    vxAuthShowView("vx-view-oauth-loading");
    await handleOAuthCallbackIfPresent();
    window.location.href = "/";
    return true;
  }
  if (path === "/forgot-password") { vxAuthShowView("vx-view-forgot"); return true; }
  if (path === "/reset-password") {
    const token = vxAuthExtractHashToken();
    if (token) { vxResetPasswordToken = token; vxAuthShowView("vx-view-reset"); }
    else vxAuthShowView("vx-view-reset-invalid");
    return true;
  }

  // /login atau /register: kalau ternyata SUDAH ada sesi valid (refresh token cookie
  // masih hidup), langsung lempar ke app -- jangan nyuruh user yang udah login isi form lagi.
  await vaeltrixSilentRefresh();
  if (isVaeltrixLoggedIn()) { window.location.href = "/"; return true; }
  vxAuthShowView(path === "/register" ? "vx-view-register" : "vx-view-login");
  return true;
}

async function submitVaeltrixLoginPage() {
  const email = document.getElementById("vx-login-email")?.value.trim() || "";
  const password = document.getElementById("vx-login-password")?.value || "";
  const errEl = document.getElementById("vx-login-error");
  const btn = document.getElementById("vx-login-submit-btn");
  const resendBtn = document.getElementById("vx-login-resend-btn");
  if (errEl) errEl.textContent = "";
  if (resendBtn) resendBtn.style.display = "none";
  if (!email || !password) { if (errEl) errEl.textContent = "Email Dan Password Wajib Diisi."; return; }
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "MEMPROSES..."; }
  try {
    await vaeltrixLogin(email, password);
    window.location.href = "/";
  } catch (e) {
    if (errEl) errEl.textContent = e.message || "Login Gagal, Coba Lagi.";
    if (resendBtn) resendBtn.style.display = e.code === "EMAIL_CONFIRMATION_REQUIRED" ? "block" : "none";
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function submitVaeltrixRegisterPage() {
  const name = document.getElementById("vx-register-name")?.value.trim() || "";
  const email = document.getElementById("vx-register-email")?.value.trim() || "";
  const password = document.getElementById("vx-register-password")?.value || "";
  const errEl = document.getElementById("vx-register-error");
  const btn = document.getElementById("vx-register-submit-btn");
  const resendBtn = document.getElementById("vx-register-resend-btn");
  if (errEl) errEl.textContent = "";
  if (resendBtn) resendBtn.style.display = "none";
  if (!email || !password) { if (errEl) errEl.textContent = "Email Dan Password Wajib Diisi."; return; }
  if (password.length < 8) { if (errEl) errEl.textContent = "Password Minimal 8 Karakter."; return; }
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "MEMPROSES..."; }
  try {
    await vaeltrixRegister(email, password, name);
    window.location.href = "/";
  } catch (e) {
    if (errEl) errEl.textContent = e.message || "Pendaftaran Gagal, Coba Lagi.";
    if (resendBtn) resendBtn.style.display = e.code === "EMAIL_CONFIRMATION_REQUIRED" ? "block" : "none";
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function submitVaeltrixForgotPassword() {
  const email = document.getElementById("vx-forgot-email")?.value.trim() || "";
  const errEl = document.getElementById("vx-forgot-error");
  const btn = document.getElementById("vx-forgot-submit-btn");
  if (errEl) errEl.textContent = "";
  if (!email) { if (errEl) errEl.textContent = "Email Wajib Diisi."; return; }
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "MENGIRIM..."; }
  try {
    await vxAuthFetch("/forgot-password", { email });
  } catch (e) {
    // Backend sengaja SELALU balikin sukses generik (hindari user enumeration) --
    // blok ini praktis cuma kepakai kalau beneran ada masalah jaringan.
  }
  if (btn) { btn.disabled = false; btn.textContent = original; }
  vxAuthShowView("vx-view-forgot-sent");
}

async function submitVaeltrixResetPassword() {
  const password = document.getElementById("vx-reset-password")?.value || "";
  const confirmPassword = document.getElementById("vx-reset-password-confirm")?.value || "";
  const errEl = document.getElementById("vx-reset-error");
  const btn = document.getElementById("vx-reset-submit-btn");
  if (errEl) errEl.textContent = "";
  if (!password || password.length < 8) { if (errEl) errEl.textContent = "Password Minimal 8 Karakter."; return; }
  if (password !== confirmPassword) { if (errEl) errEl.textContent = "Konfirmasi Password Tidak Cocok."; return; }
  if (!vxResetPasswordToken) { vxAuthShowView("vx-view-reset-invalid"); return; }
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "MENYIMPAN..."; }
  try {
    await vxAuthFetch("/reset-password", { accessToken: vxResetPasswordToken, newPassword: password });
    if (typeof showToast === "function") showToast("Password Berhasil Diganti, Silakan Login.");
    window.location.href = "/login";
  } catch (e) {
    if (e.code === "AUTHENTICATION_ERROR") { vxAuthShowView("vx-view-reset-invalid"); return; }
    if (errEl) errEl.textContent = e.message || "Gagal Menyimpan Password Baru.";
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// ---- Init: kalau ini salah satu halaman auth dedicated di atas, vxAuthBoot()
// yang ambil alih sepenuhnya (termasuk callback OAuth). Kalau bukan, jalan seperti
// sebelumnya -- vaeltrixSilentRefresh() sendiri SUDAH membungkus isinya dengan
// try/catch penuh, kalau backend belum di-deploy/unreachable, dia gagal diam-diam
// dan app tetap jalan normal di jalur BYOK. ----
(async () => {
  if (await vxAuthBoot()) return;
  vaeltrixSilentRefresh();
})();

// Balik dari Stripe Checkout (lihat returnUrl di startVaeltrixCheckout) -- URL-nya bakal punya
// ?session_id=... nempel. Webhook Stripe yang beneran nge-update tier di server (async, di luar
// kendali kita kapan persisnya selesai) -- ini MURNI konfirmasi visual + beresin URL biar refresh
// halaman gak nampilin toast yang sama berulang-ulang.
(function handleVaeltrixCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("session_id")) return;
  if (typeof showToast === "function") showToast("Pembayaran Diterima, Paket Kamu Segera Terupdate");
  params.delete("session_id");
  const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : "") + window.location.hash;
  window.history.replaceState({}, "", cleanUrl);
})();
