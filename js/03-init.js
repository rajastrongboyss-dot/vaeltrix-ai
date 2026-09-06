// VaeltrixAI — Init: app bootstrap (window.onload), onboarding

// ============ INIT ============
// PENTING: window.onload dibungkus try/catch per-tahap (bukan satu blok polos) — kalau salah satu
// fungsi di sini error/undefined (misal gara-gara cache lama, lihat catatan di updateScrollBtnVisibility
// di bawah), tahap-tahap SETELAHNYA (theme, font size, app lock, dst) tetap jalan normal, gak ikut
// mati diam-diam kayak sebelumnya. Setiap error tetap di-log ke console biar ketauan pas debug.
function safeInit(label, fn) {
  try { fn(); } catch (e) { console.error(`VaeltrixAI Init Gagal [${label}]:`, e); }
}
// Versi async dari safeInit — dipakai KHUSUS buat migrateSessionsToIndexedDB() di bawah, yang
// HARUS kelar duluan (await) sebelum safeInit("core", ...) jalan, karena core butuh `sessions`
// udah keisi data yang bener (baik dari IndexedDB maupun fallback localStorage).
async function safeInitAsync(label, fn) {
  try { await fn(); } catch (e) { console.error(`VaeltrixAI Init Gagal [${label}]:`, e); }
}

// ============ MIGRASI SESSIONS: localStorage → IndexedDB (v1.8.0) ============
// `sessions` udah keisi SINKRON dari localStorage duluan di 01-config.js (`let sessions =
// JSON.parse(localStorage.getItem("vaeltrix_sessions") || "[]")`) — itu dipertahankan APA ADANYA
// sebagai fallback instan, biar app tetap kebuka normal walau IndexedDB gagal total/browser lawas
// gak support. Fungsi ini nyoba upgrade ke IndexedDB (kuota jauh lebih gede, lihat 02-utils.js):
// - Kalau IndexedDB UDAH punya data (pernah migrasi sebelumnya) → itu sumber kebenarannya sekarang,
//   `sessions` ditimpa sama itu.
// - Kalau IndexedDB masih kosong tapi localStorage ada isinya (pertama kali jalan di v1.8.0) →
//   pindahin, VERIFIKASI dulu (baca balik & cek jumlahnya cocok) sebelum localStorage lama
//   disentuh — sesuai prinsip spec "jangan hapus data lama sebelum verification sukses". Kalau
//   verifikasi gagal, localStorage lama TETAP dibiarin utuh (bukan dihapus paksa).
async function migrateSessionsToIndexedDB() {
  if (!("indexedDB" in window)) {
    console.warn("VaeltrixAI: IndexedDB gak didukung browser ini, tetap pakai localStorage buat riwayat chat.");
    return;
  }
  try {
    const idbData = await idbGet("vaeltrix_sessions");
    if (Array.isArray(idbData)) {
      sessions = idbData;
      return;
    }
    if (!Array.isArray(sessions) || sessions.length === 0) return; // gak ada apa-apa buat dipindah
    await idbSet("vaeltrix_sessions", sessions);
    const verify = await idbGet("vaeltrix_sessions");
    if (Array.isArray(verify) && verify.length === sessions.length) {
      const oldRaw = localStorage.getItem("vaeltrix_sessions");
      if (oldRaw) {
        // Disimpen sebagai cadangan (bukan dihapus total) — kalau ternyata ada yang meleset,
        // datanya masih bisa ditelusuri manual, bukan hilang tanpa jejak.
        localStorage.setItem("vaeltrix_sessions_backup_v17", oldRaw);
        localStorage.removeItem("vaeltrix_sessions");
      }
      console.log(`VaeltrixAI: ${sessions.length} sesi berhasil dipindah ke IndexedDB.`);
    } else {
      console.warn("VaeltrixAI: verifikasi migrasi IndexedDB gak cocok jumlahnya — localStorage lama TETAP dipertahankan, coba lagi nanti.");
    }
  } catch (e) {
    // IndexedDB gagal total (private mode yang ngeblokir, quota browser abis, dst) — gak fatal,
    // `sessions` tetep isi dari localStorage kayak v1.7.0, app jalan normal cuma gak dapet untung
    // kuota gede. saveSessions() di 05-sidebar.js juga otomatis fallback ke localStorage kalau
    // IndexedDB gak kesedia pas nyimpen.
    console.warn("VaeltrixAI: migrasi IndexedDB gak jalan, tetap pakai localStorage buat riwayat chat.", e);
  }
}

window.onload = async () => {
  // Cek dulu apakah ini link Share (read-only) sebelum render normal
  if (location.hash.startsWith("#share=")) {
    renderSharedView();
    return;
  }

  // v1.8.0 — pindah/pulihin riwayat chat dari IndexedDB SEBELUM render apapun yang butuh
  // `sessions`. Kalau ini gagal/browser gak support, `sessions` tetep isi hasil baca localStorage
  // sinkron dari 01-config.js — app tetap kebuka normal, gak ketahan nunggu apapun.
  await safeInitAsync("storage-migration", migrateSessionsToIndexedDB);

  safeInit("core", () => {
    updatePlanUI();
    checkInterruptedMessages();
    renderHistory();
    initResetTimer();
    updateCounter();
    renderQuickPrompts();
    renderQpBar();
    renderMemoryList();
    initReferral();

    // Pulihkan chat terakhir yang aktif (persist lintas reload)
    // ID sesi lokal itu angka (Date.now()), tapi ID sesi hasil sync dari backend itu string
    // ("remote-xxx", lihat 18-cloud-sync.js) -- localStorage SELALU balikin string apa pun aslinya,
    // jadi dibandingin sebagai string di kedua sisi (String(s.id)) biar cocok utk DUA jenis ID
    // itu sekaligus. parseInt() yang dipakai sebelumnya bikin ID string jadi NaN, dan NaN gak
    // pernah match ke apa pun (NaN === NaN itu false) -- pemulihan "chat terakhir aktif" diam-diam
    // gagal tiap kali chat terakhirnya kebetulan sesi dari backend.
    const lastId = localStorage.getItem("vaeltrix_last_session_id");
    const lastSession = lastId ? sessions.find(s => String(s.id) === lastId) : null;
    if (lastSession) {
      currentSession = lastSession;
      if (currentSession.mode) setMode(currentSession.mode);
      renderHistory();
    }
    renderChat();
    restoreDraft();
    renderPersonaList();
  });

  safeInit("restore-keys", () => {
    const saved = localStorage.getItem("vaeltrix_user_key");
    if (saved) {
      document.getElementById("api-key-input").value = saved;
      document.getElementById("api-status").textContent = "Key Tersimpan.";
      document.getElementById("api-status").style.color = "#4ade80";
    }
    const savedGroq = localStorage.getItem("vaeltrix_groq_key");
    if (savedGroq) {
      document.getElementById("groq-key-input").value = savedGroq;
    }
    const savedTavily = localStorage.getItem("vaeltrix_tavily_key");
    if (savedTavily) {
      document.getElementById("tavily-key-input").value = savedTavily;
    }
    const savedOpenRouter = localStorage.getItem("vaeltrix_openrouter_key");
    if (savedOpenRouter) {
      const orInput = document.getElementById("openrouter-key-input");
      if (orInput) orInput.value = savedOpenRouter;
    }
    const savedEleven = localStorage.getItem("vaeltrix_elevenlabs_key");
    if (savedEleven) {
      document.getElementById("elevenlabs-key-input").value = savedEleven;
    }
  });

  // Sidebar: permanen di desktop (sesuai preferensi tersimpan), drawer tertutup di mobile
  safeInit("sidebar", () => applyInitialSidebarState());

  // Info shortcut keyboard cuma relevan buat desktop (mobile: Enter = baris baru)
  safeInit("input-hint", () => {
    if (!isTouchDevice()) {
      const hint = document.getElementById("input-hint");
      if (hint) hint.innerHTML += ' &middot; <span style="opacity:0.8;">Enter Kirim, Shift+Enter Baris Baru</span>';
    }
  });

  safeInit("listeners", () => {
    document.getElementById("premium-code-input")?.addEventListener("keydown", e => {
      if (e.key === "Enter") activatePremium();
    });

    // Tutup more-menu kalau klik di luar
    document.addEventListener("click", (e) => {
      const wrap = document.getElementById("more-menu-wrap");
      if (wrap && !wrap.contains(e.target)) document.getElementById("more-menu").classList.remove("open");
    });

    // Aksesibilitas: tombol Escape menutup modal/sheet yang lagi kebuka
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document.getElementById("more-menu")?.classList.remove("open");
      ["qp-backdrop","stats-backdrop","ref-backdrop","export-backdrop","share-backdrop","search-backdrop","onboard-backdrop"].forEach(id => {
        document.getElementById(id)?.classList.remove("show");
      });
      if (document.getElementById("premium-modal")?.classList.contains("show")) closePremiumModal();
      if (document.getElementById("preview-modal")?.classList.contains("show")) closePreview();
      if (document.getElementById("code-expand-modal")?.classList.contains("show")) closeCodeExpand();
      if (!isDesktopLayout() && !document.getElementById("sidebar").classList.contains("hidden")) closeSidebar();
    });

    // Keyboard shortcut buat pengguna desktop: Ctrl/Cmd+K = Cari Chat, Ctrl/Cmd+N = Chat Baru
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k") { e.preventDefault(); openSearchModal(); }
      else if (key === "n") { e.preventDefault(); newChat(); }
    });
  });

  // Tombol scroll-ke-bawah — muncul kalau posisi baca udah jauh dari pesan terbaru.
  // Guard `typeof` di sini SENGAJA ditambahin: fungsi updateScrollBtnVisibility ini didefinisikan
  // normal di 02-utils.js (dimuat SEBELUM file ini, jadi seharusnya selalu ada). Kalau tetap muncul
  // "updateScrollBtnVisibility is not defined" di production, itu tandanya browser user lagi
  // nyimpen versi CAMPURAN dari cache Service Worker lama (misal 03-init.js sudah versi baru tapi
  // 02-utils.js masih versi lama sebelum fungsi ini ditambahin, atau sebaliknya) — bukan berarti
  // fungsinya beneran hilang dari source. Sudah diperbaiki juga di sw.js: aset js/css punya app ini
  // sekarang network-first (bukan cache-first lagi), jadi user otomatis dapet versi terbaru & konsisten
  // tiap buka app selama online, gak akan ke-mix lagi kayak sebelumnya. Guard di sini tetap dipasang
  // sebagai lapisan aman tambahan (defense-in-depth) biar SATU fungsi yang gagal load gak bikin
  // sisa init (tema, onboarding, dst) ikut mati.
  safeInit("scroll-btn", () => {
    if (typeof updateScrollBtnVisibility === "function") {
      document.getElementById("chat")?.addEventListener("scroll", updateScrollBtnVisibility);
      updateScrollBtnVisibility();
    } else {
      console.warn("VaeltrixAI: updateScrollBtnVisibility belum termuat (kemungkinan cache lama) — reload sekali lagi biasanya beres.");
    }
  });

  // Indikator koneksi terputus
  safeInit("offline-indicator", () => {
    window.addEventListener("offline", () => setOfflineBanner(true));
    window.addEventListener("online", () => setOfflineBanner(false));
    if (!navigator.onLine) setOfflineBanner(true);
  });

  // Service Worker — biar VaeltrixAI bisa di-install sebagai app & tetap kebuka pas offline
  safeInit("service-worker", () => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch((err) => {
          console.warn("VaeltrixAI: Service Worker Gagal Didaftarkan.", err);
        });
      });
    }
  });

  // Onboarding — cuma muncul sekali di kunjungan pertama
  safeInit("onboarding", () => {
    if (localStorage.getItem("vaeltrix_onboarded") !== "true") {
      setTimeout(() => document.getElementById("onboard-backdrop")?.classList.add("show"), 500);
    }
  });

  // Kalau dibuka lewat link referral teman (?ref=KODE), auto-isi di kolom klaim
  safeInit("referral-link", () => {
    const params = new URLSearchParams(location.search);
    const refFromLink = params.get("ref");
    if (refFromLink && refFromLink !== referralCode) {
      setTimeout(() => {
        openReferralModal();
        document.getElementById("ref-input").value = refFromLink.toUpperCase();
      }, 500);
    }
  });

  // ==== Init Settings (Theme, Font Size, Language, App Lock, Profil) ====
  await safeInitAsync("settings", async () => {
    applyTheme(getTheme());
    applyFontSize(getFontSize());
    updateProfileUI();
    await checkAppLock(); // sekarang async (Web Crypto PIN hash/migrasi, Phase 3)
    document.querySelectorAll(".beta-badge").forEach(b => b.style.display = isBetaEnabled() ? "inline" : "none");
  });
};


// ============ TOAST ============
// ============ ONBOARDING ============
function onboardGoTo(i) {
  document.querySelectorAll(".onboard-slide").forEach(s => s.classList.toggle("active", parseInt(s.dataset.slide, 10) === i));
  document.querySelectorAll(".onboard-dot").forEach(d => d.classList.toggle("active", parseInt(d.dataset.dot, 10) === i));
  const skipBtn = document.getElementById("onboard-skip-btn");
  if (skipBtn) skipBtn.style.display = (i === 3) ? "none" : "";
}
function closeOnboarding() {
  localStorage.setItem("vaeltrix_onboarded", "true");
  document.getElementById("onboard-backdrop")?.classList.remove("show");
  // Abis onboarding, tawarin pilihan login (Google/Github/Email) -- TETAP bisa
  // di-skip/close biar mode tamu (BYOK) gak keblok, cuma dimunculin duluan
  // daripada ketimbun di dalam menu Settings.
  if (typeof isVaeltrixLoggedIn === "function" && !isVaeltrixLoggedIn() && typeof openAccountModal === "function") {
    setTimeout(openAccountModal, 400);
  }
}

// ============ PEMULIHAN RESPONS TERPUTUS ============
// PENTING BUAT DIPAHAMI: VaeltrixAI itu app statis client-side murni (gak ada server sendiri),
// manggil Gemini/Groq LANGSUNG dari browser. Kalau app/tab BENERAN ditutup total (bukan cuma
// diminimize) di tengah proses generate jawaban, request yang lagi jalan di JS ikut mati —
// GAK ADA cara bikin dia "tetap jalan di background" beneran dan nunggu buat dipulihin, karena
// gak ada proses server yang megang & nerusin kerjaannya. Itu beda cerita kalau app ini punya
// backend sendiri (lihat obrolan kita soal Cloudflare Worker) — baru di situ generate beneran
// bisa lanjut walau app di-close total, karena yang kerja adalah SERVER, bukan tab browser user.
//
// Yang REALISTIS bisa dijamin app client-side kayak gini:
// 1. Kalau tab/app cuma di-MINIMIZE/pindah app sebentar (bukan di-force-close) — proses JS-nya
//    masih hidup, jawaban tetap keproses, dan notifyIfBackground() bakal munculin notifikasi pas
//    kelar. Ini udah jalan.
// 2. Kalau app BENERAN ditutup di tengah proses — jawabannya emang hilang/gagal, TAPI daripada
//    pesan itu ilang tanpa jejak (kayak sebelumnya), sekarang dikasih tau jujur & bisa dikirim
//    ulang. Fungsi ini yang ngecek itu, dipanggil sekali tiap app dibuka/di-reload.
function checkInterruptedMessages() {
  let found = 0;
  sessions.forEach(s => {
    (s.messages || []).forEach(m => {
      if (m.pending) {
        m.content = "⚠️ **Respons Terputus**\n\nApp Sempat Ditutup Atau Di-Reload Saat VaeltrixAI Masih Memproses Jawaban Ini, Jadi Prosesnya Ikut Terhenti. Kirim Ulang Pesan Sebelumnya Ya, Tuan.";
        m.interrupted = true;
        delete m.pending;
        found++;
      }
    });
  });
  if (found > 0) saveSessions();
}


