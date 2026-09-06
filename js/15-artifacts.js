// VaeltrixAI — Vaeltrix Artifact
// Panel terpisah buat kode/dokumen panjang yang bisa diedit & di-preview live (khusus HTML),
// mirip Artifacts di Claude. SENGAJA ditambahin SEBAGAI TOMBOL BARU di toolbar code block yang
// udah ada (lihat 08-markdown.js) — bukan ganti sistem Salin/Perbesar/Preview bawaan — jadi kalau
// ada bug di sini, fitur kode yang lama tetap jalan normal seperti sebelumnya.

let artifactPanelState = { sessionId: null, msgId: null, idx: null, tab: "code" };

// Ekstrak SEMUA fenced code block dari sebuah teks pesan, urutannya harus PERSIS sama kayak
// loop code block di parseMarkdown() (08-markdown.js) — index dipakai buat nyambungin tombol
// "Buka Artifact" di bubble ke entry yang bener di array ini.
function extractArtifacts(text) {
  const out = [];
  if (!text) return out;
  // WAJIB sama persis kayak regex di parseMarkdown() (08-markdown.js) — grup 1 bahasa, grup 2
  // nama file (opsional, format "```js:server.js"), grup 3 isi kode — biar index nyambung.
  const re = /```([\w+-]*)(?::([^\n`]+))?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "").toLowerCase();
    const filename = m[2] ? m[2].trim() : null;
    const code = (m[3] || "").trim();
    out.push({ language: lang || "text", filename, code, isHtml: isArtifactHtml(lang, code), edited: false });
  }
  return out;
}

// Heuristik "boleh di-preview sebagai HTML" — dipakai bareng oleh parseMarkdown() (buat tombol
// mata/preview yang udah ada) dan extractArtifacts() di sini, biar 2 tempat itu gak pernah beda pendapat.
function isArtifactHtml(lang, code) {
  return lang === "html" ||
    code.includes("<!DOCTYPE") || code.includes("<html") || code.includes("<body") ||
    ((code.includes("<style") || code.includes("<script")) && code.includes("<div")) ||
    (code.includes("function") && code.includes("<canvas")) ||
    code.includes("<canvas") || code.includes("getElementById");
}

function guessArtifactTitle(language) {
  const map = { html: "HTML Preview", javascript: "JavaScript", js: "JavaScript", jsx: "React Component",
    python: "Python", py: "Python", css: "CSS", json: "JSON", svg: "SVG Image", markdown: "Markdown",
    md: "Markdown", typescript: "TypeScript", ts: "TypeScript", bash: "Script Shell", sh: "Script Shell" };
  return map[language] || (language && language !== "text" ? language.toUpperCase() : "Kode");
}

// Ambil (dan kalau belum ada, hitung + simpan sekali) array artifacts milik sebuah message.
// Fallback ini PENTING buat chat lama yang udah kesimpen sebelum fitur ini ada — kode block-nya
// tetep bisa dibuka jadi Artifact tanpa perlu migrasi data apapun.
function getMessageArtifacts(msg) {
  if (!msg) return [];
  if (!msg.artifacts) {
    msg.artifacts = extractArtifacts(msg.content || "");
    saveSessions();
  }
  return msg.artifacts;
}

function findSessionAndMessage(sessionId, msgId) {
  const s = sessions.find(s => s.id === sessionId) || (currentSession?.id === sessionId ? currentSession : null);
  if (!s) return { session: null, msg: null };
  const msg = s.messages.find(m => m.id === msgId);
  return { session: s, msg };
}

function openArtifactPanel(msgId, idx) {
  if (!currentSession) return;
  const msg = currentSession.messages.find(m => m.id === msgId);
  if (!msg) return;
  const arts = getMessageArtifacts(msg);
  const art = arts[idx];
  if (!art) { showToast("Artifact Gak Ketemu", true); return; }

  artifactPanelState = { sessionId: currentSession.id, msgId, idx, tab: art.isHtml ? "preview" : "code" };

  document.getElementById("artifact-panel-title").textContent = guessArtifactTitle(art.language);
  const editor = document.getElementById("artifact-code-editor");
  editor.value = art.code;

  const previewTabBtn = document.getElementById("artifact-tab-preview");
  previewTabBtn.style.display = art.isHtml ? "inline-flex" : "none";

  renderArtifactVersionBar(art);
  switchArtifactTab(artifactPanelState.tab);
  document.getElementById("artifact-panel").classList.add("show");
}

function closeArtifactPanel() {
  document.getElementById("artifact-panel").classList.remove("show");
  document.getElementById("artifact-preview-frame").srcdoc = "";
}

function switchArtifactTab(tab) {
  artifactPanelState.tab = tab;
  const editor = document.getElementById("artifact-code-editor");
  const frame = document.getElementById("artifact-preview-frame");
  document.getElementById("artifact-tab-code").classList.toggle("active", tab === "code");
  document.getElementById("artifact-tab-preview").classList.toggle("active", tab === "preview");
  if (tab === "preview") {
    editor.style.display = "none";
    frame.style.display = "block";
    frame.srcdoc = editor.value;
  } else {
    frame.style.display = "none";
    editor.style.display = "block";
  }
}

function getCurrentArtifactEntry() {
  const { sessionId, msgId, idx } = artifactPanelState;
  const { msg } = findSessionAndMessage(sessionId, msgId);
  if (!msg || !msg.artifacts) return null;
  return msg.artifacts[idx] || null;
}

function saveArtifactCode() {
  const art = getCurrentArtifactEntry();
  if (!art) { showToast("Gagal Nyimpen — Artifact Gak Ketemu", true); return; }
  const newCode = document.getElementById("artifact-code-editor").value;
  if (newCode === art.code) { showToast("Tidak Ada Perubahan Buat Disimpan"); return; }
  // Phase 5 (Version): simpen kode LAMA ke riwayat SEBELUM ditimpa kode baru -- baru bisa balik
  // ke versi tengah (bukan cuma original vs current) begitu ada minimal 1x save sebelumnya.
  if (!art.versions) art.versions = [];
  art.versions.push({ code: art.code, savedAt: Date.now() });
  if (art.versions.length > 20) art.versions = art.versions.slice(-20); // batasi, jangan numpuk tak terbatas
  art.code = newCode;
  art.edited = true;
  saveSessions();
  if (artifactPanelState.tab === "preview") document.getElementById("artifact-preview-frame").srcdoc = art.code;
  renderArtifactVersionBar(art);
  showToast("Perubahan Artifact Tersimpan");
}

// Isi ulang dropdown riwayat versi. Ditampilin PALING BARU DULUAN (kebalikan urutan tersimpan),
// disembunyikan total kalau belum pernah ada save (gak ada riwayat = gak perlu nunjukin apa-apa).
function renderArtifactVersionBar(art) {
  const bar = document.getElementById("artifact-version-bar");
  const select = document.getElementById("artifact-version-select");
  if (!bar || !select) return;
  if (!art?.versions?.length) { bar.style.display = "none"; return; }
  bar.style.display = "block";
  const opts = [`<option value="" disabled selected>Riwayat Versi (${art.versions.length})</option>`];
  for (let i = art.versions.length - 1; i >= 0; i--) {
    opts.push(`<option value="${i}">Versi ${i + 1} — ${formatRelativeTimeVx(art.versions[i].savedAt)}</option>`);
  }
  select.innerHTML = opts.join("");
}

// Muat SALAH SATU versi lama ke editor -- SENGAJA belum langsung nge-save (sama filosofinya kayak
// resetArtifactCode: liat dulu isinya, baru Simpan Perubahan lagi kalau memang mau dipakai).
function loadArtifactVersion(indexStr) {
  if (indexStr === "") return;
  const art = getCurrentArtifactEntry();
  const version = art?.versions?.[Number(indexStr)];
  if (!version) { showToast("Versi Gak Ketemu", true); return; }
  document.getElementById("artifact-code-editor").value = version.code;
  if (artifactPanelState.tab === "preview") document.getElementById("artifact-preview-frame").srcdoc = version.code;
  showToast(`Versi ${Number(indexStr) + 1} Dimuat Ke Editor (Belum Disimpan)`);
}

// Pakai buat label "3 menit lalu" dkk di dropdown versi. Nama di-suffix "Vx" biar gak nabrak
// kalau ternyata sudah ada helper waktu relatif dengan nama umum di file lain.
function formatRelativeTimeVx(ts) {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Baru Saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} Menit Lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} Jam Lalu`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} Hari Lalu`;
}

function resetArtifactCode() {
  const { sessionId, msgId, idx } = artifactPanelState;
  const { msg } = findSessionAndMessage(sessionId, msgId);
  if (!msg) return;
  const original = extractArtifacts(msg.content || "")[idx];
  if (!original) { showToast("Versi Asli Gak Ketemu", true); return; }
  document.getElementById("artifact-code-editor").value = original.code;
  if (artifactPanelState.tab === "preview") document.getElementById("artifact-preview-frame").srcdoc = original.code;
  showToast("Dikembalikan Ke Versi Asli Dari Vaeltrix (Belum Disimpan)");
}

function copyArtifactCode() {
  const code = document.getElementById("artifact-code-editor").value;
  copyToClipboard(code).then(() => showToast("Kode Artifact Disalin")).catch(() => showToast("Gagal Salin", true));
}

function downloadArtifactCode() {
  const art = getCurrentArtifactEntry();
  const code = document.getElementById("artifact-code-editor").value;
  const extMap = { html: "html", javascript: "js", js: "js", jsx: "jsx", python: "py", py: "py",
    css: "css", json: "json", svg: "svg", typescript: "ts", ts: "ts", markdown: "md", md: "md",
    bash: "sh", sh: "sh" };
  const ext = extMap[art?.language] || "txt";
  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = art?.filename ? art.filename.split("/").pop() : `vaeltrix-artifact.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ============ ARTIFACTS LIST (Tombol Sidebar) ============
function openArtifactsListPanel() {
  const wrap = document.getElementById("artifacts-list");
  wrap.innerHTML = "";
  const rows = [];
  sessions.forEach(s => {
    s.messages.forEach(m => {
      if (m.role !== "ai") return;
      const arts = (m.artifacts) ? m.artifacts : extractArtifacts(m.content || "").filter(a => a.code.length >= ARTIFACT_MIN_LEN);
      arts.forEach((a, idx) => {
        if (a.code.length < ARTIFACT_MIN_LEN) return;
        rows.push({ sessionId: s.id, sessionTitle: s.title, msgId: m.id, idx, art: a });
      });
    });
  });
  if (!rows.length) {
    wrap.innerHTML = `<div class="search-empty">Belum Ada Artifact. Artifact Otomatis Muncul Kalau Vaeltrix Ngasih Kode/Dokumen Yang Cukup Panjang, Tinggal Tap "Buka Artifact" Di Bubble Jawabannya.</div>`;
  } else {
    rows.reverse().forEach(r => {
      const d = document.createElement("div");
      d.className = "export-opt";
      d.onclick = () => {
        closeArtifactsListPanel();
        if (currentSession?.id !== r.sessionId) loadSession(r.sessionId);
        setTimeout(() => openArtifactPanel(r.msgId, r.idx), currentSession?.id === r.sessionId ? 0 : 250);
      };
      d.innerHTML = `
        <div class="qp-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
        <div><div class="qp-title">${escHtml(guessArtifactTitle(r.art.language))}</div><div class="qp-desc">${escHtml(r.sessionTitle)}</div></div>`;
      wrap.appendChild(d);
    });
  }
  document.getElementById("artifacts-list-backdrop").classList.add("show");
  if (!isDesktopLayout()) closeSidebar();
}
function closeArtifactsListPanel() {
  document.getElementById("artifacts-list-backdrop").classList.remove("show");
}

// Nempelin kartu "Buka Artifact" ke bubble jawaban AI yang punya code block layak-artifact.
// Dipanggil dari appendBubble() & finalizeBubble() (06-chat-core.js) — DIBUNGKUS try/catch di
// sisi pemanggil biar kalaupun ada error di sini, alur render chat utama tetep jalan normal.
function attachArtifactButtons(wrap, msgId) {
  if (!wrap) return;
  wrap.querySelectorAll(".code-block-wrap").forEach(cb => {
    const idx = cb.dataset.artifactIdx;
    if (idx === undefined) return;
    if (cb.querySelector(".artifact-open-btn")) return; // udah ada, jangan dobel
    const actions = cb.querySelector(".code-block-actions");
    if (!actions) return;
    const btn = document.createElement("button");
    btn.className = "code-icon-btn artifact-open-btn";
    btn.title = "Buka Sebagai Artifact";
    btn.setAttribute("aria-label", "Buka Sebagai Artifact");
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); openArtifactPanel(msgId, Number(idx)); });
    actions.appendChild(btn);
  });
  try { attachProjectChip(wrap, msgId); } catch (e) {}
}

// ============================================================
// VAELTRIX PROJECT PANEL — "N Artefak" (proyek multi-file)
// Ngelist SEMUA code block yang punya nama file (```bahasa:nama-file.ext, lihat ATURAN PROYEK
// MULTI-FILE di FORMAT_GUIDE / 07-providers.js) dalam 1 pesan jadi panel kayak file explorer,
// tiap file bisa diunduh satu-satu ATAU sekaligus jadi 1 ZIP (pakai JSZip yang udah kemuat di
// index.html). SENGAJA gak ganti sistem Artifact single-file yang udah ada — cuma nambahin
// lapisan tampilan di atasnya buat kasus 2 file atau lebih.
// ============================================================

let projectPanelState = { msgId: null };

const DOC_EXTS  = ["md", "markdown", "txt", "rst"];
const CODE_EXTS = ["js", "jsx", "ts", "tsx", "py", "html", "htm", "css", "scss", "json", "sh", "bash",
  "java", "go", "rb", "php", "c", "cpp", "cs", "sql", "vue", "swift", "kt", "xml"];

function getFileExt(filename) {
  const base = (filename || "").split("/").pop();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}
function fileKind(filename) {
  const ext = getFileExt(filename);
  if (DOC_EXTS.includes(ext)) return "doc";
  if (CODE_EXTS.includes(ext)) return "code";
  return "other";
}
function fileKindLabel(kind) {
  return kind === "doc" ? "Dokumen" : kind === "code" ? "Kode" : "File";
}
const FILE_ICON_DOC   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const FILE_ICON_CODE  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
const FILE_ICON_OTHER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
function fileKindIcon(kind) {
  return kind === "doc" ? FILE_ICON_DOC : kind === "code" ? FILE_ICON_CODE : FILE_ICON_OTHER;
}
// "server.js" -> "Server", "README.md" -> "README" (nama all-caps kayak README/LICENSE dibiarin apa adanya)
function prettyFileTitle(filename) {
  const base = (filename || "").split("/").pop();
  const dot = base.lastIndexOf(".");
  let name = dot > 0 ? base.slice(0, dot) : base;
  if (!name) return base;
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) return name;
  name = name.replace(/[-_]+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getProjectFiles(msg) {
  return getMessageArtifacts(msg).map((a, idx) => ({ ...a, idx })).filter(a => a.filename);
}
function isProjectMessage(msg) {
  return getProjectFiles(msg).length >= 2;
}

// ============ ARTIFACT VALIDATOR (v1.8.0) ============
// Pengecekan STATIS doang (cocok-cocokin string/regex) — GAK menjalankan kode apapun sama sekali
// (sesuai spec: "Jangan menjalankan arbitrary code"). Sifatnya INFORMASIONAL (banner di panel,
// BUKAN ngeblok download/ZIP) karena false-positive selalu mungkin — mis. file HTML yang
// nge-referensiin script dari CDN eksternal itu valid, bukan file lokal yang ilang.
function validateProjectFiles(files) {
  const warnings = [];
  const names = files.map(f => f.filename).filter(Boolean);
  const nameSet = new Set(names.map(n => n.replace(/^\/+/, "")));

  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) warnings.push(`Ada 2 file dengan nama sama: "${n}" — salah satunya bakal ketimpa waktu diunduh/di-ZIP.`);
    seen.add(n);
  }
  for (const f of files) {
    if (!f.filename || !f.filename.trim()) warnings.push("Ada file tanpa nama.");
  }
  // Cek referensi src/href di file HTML — apakah file yang direferensikan beneran ada di daftar.
  for (const f of files) {
    if (!/\.html?$/i.test(f.filename || "")) continue;
    const refs = [...(f.code || "").matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
    for (const ref of refs) {
      // Lewatin URL eksternal/CDN, data URI, anchor dalam-halaman, dan mailto — cuma cek path lokal.
      if (/^([a-z]+:)?\/\//i.test(ref) || ref.startsWith("data:") || ref.startsWith("#") || ref.startsWith("mailto:")) continue;
      const cleanRef = ref.split("?")[0].split("#")[0].replace(/^\.\//, "").replace(/^\/+/, "");
      if (cleanRef && !nameSet.has(cleanRef)) {
        warnings.push(`"${f.filename}" mereferensikan "${ref}", tapi file itu gak ada di daftar artefak ini.`);
      }
    }
  }
  for (const f of files) {
    if (!/\.json$/i.test(f.filename || "")) continue;
    try { JSON.parse(f.code || ""); } catch (e) { warnings.push(`"${f.filename}" isinya bukan JSON yang valid.`); }
  }
  return warnings;
}

// Nempelin chip "N Artefak" di bawah bubble jawaban AI, sebelum baris tombol footer (regenerate/
// speak/like/dislike/share/copy) — cuma nongol kalau pesannya emang kedeteksi sebagai proyek
// (2 file bernama atau lebih), gak ganggu tampilan bubble biasa/single-file.
function attachProjectChip(wrap, msgId) {
  if (!wrap) return;
  const msg = currentSession?.messages.find(m => m.id === msgId);
  if (!msg || !isProjectMessage(msg)) return;
  if (wrap.querySelector(".artefak-chip")) return; // udah ada, jangan dobel
  const count = getProjectFiles(msg).length;
  const chip = document.createElement("button");
  chip.className = "artefak-chip";
  chip.type = "button";
  chip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><b>${count} Artefak</b>`;
  chip.addEventListener("click", () => openProjectPanel(msgId));
  const footer = wrap.querySelector(".bubble-footer");
  if (footer) footer.insertAdjacentElement("beforebegin", chip);
  else wrap.appendChild(chip);
}

function openProjectPanel(msgId) {
  const msg = currentSession?.messages.find(m => m.id === msgId);
  if (!msg) return;
  const files = getProjectFiles(msg);
  if (!files.length) { showToast("Artefak Gak Ketemu", true); return; }

  projectPanelState = { msgId };
  const list = document.getElementById("artefak-files-list");
  list.innerHTML = files.map(f => {
    const kind = fileKind(f.filename);
    const ext = getFileExt(f.filename).toUpperCase() || "FILE";
    return `
    <div class="export-opt artefak-file-row">
      <div class="qp-icon artefak-file-open" onclick="openArtifactPanel(${msgId}, ${f.idx})">${fileKindIcon(kind)}</div>
      <div class="artefak-file-text artefak-file-open" onclick="openArtifactPanel(${msgId}, ${f.idx})">
        <div class="qp-title">${escHtml(prettyFileTitle(f.filename))}</div>
        <div class="qp-desc">${escHtml(fileKindLabel(kind))} · ${escHtml(ext)}</div>
      </div>
      <button class="artefak-dl-btn" title="Unduh ${escHtml(f.filename)}" aria-label="Unduh ${escHtml(f.filename)}" onclick="event.stopPropagation(); downloadSingleProjectFile(${msgId}, ${f.idx})">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </div>`;
  }).join("");

  const countEl = document.getElementById("project-panel-count");
  if (countEl) countEl.textContent = `${files.length} Artefak · Tap File Buat Buka, Ikon Panah Buat Unduh Satu-Satu`;

  // Artifact Validator — banner informasional doang, gak ngeblok apapun (user tetap bisa
  // download/ZIP walau ada warning; false-positive selalu mungkin, mis. referensi ke CDN).
  const existingBanner = document.getElementById("project-panel-warnings");
  if (existingBanner) existingBanner.remove();
  const warnings = validateProjectFiles(files);
  if (warnings.length) {
    const banner = document.createElement("div");
    banner.id = "project-panel-warnings";
    banner.style.cssText = "background:rgba(128,128,128,0.1);border:1px solid var(--gold, #808080);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--gold, #808080);line-height:1.5;";
    banner.innerHTML = `<b>⚠ ${warnings.length} Hal Perlu Dicek:</b><br>` + warnings.map(w => escHtml(w)).join("<br>");
    list.parentElement.insertBefore(banner, list);
  }

  document.getElementById("project-panel-backdrop").classList.add("show");
}
function closeProjectPanel() {
  document.getElementById("project-panel-backdrop").classList.remove("show");
}

function downloadSingleProjectFile(msgId, idx) {
  const msg = currentSession?.messages.find(m => m.id === msgId);
  const art = msg ? getMessageArtifacts(msg)[idx] : null;
  if (!art || !art.filename) { showToast("File Gak Ketemu", true); return; }
  const blob = new Blob([art.code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = art.filename.split("/").pop();
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function downloadAllProjectFiles() {
  const { msgId } = projectPanelState;
  const msg = currentSession?.messages.find(m => m.id === msgId);
  if (!msg) return;
  const files = getProjectFiles(msg);
  if (!files.length) return;
  if (typeof JSZip === "undefined" && typeof window.JSZip === "undefined") {
    showToast("Gagal Unduh. Library ZIP Belum Kemuat, Coba Lagi..", true);
    return;
  }
  const btn = document.getElementById("project-download-all-btn");
  const originalLabel = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "<b>Menyiapkan ZIP…</b>"; }
  try {
    const Zip = window.JSZip || JSZip;
    const zip = new Zip();
    files.forEach(f => zip.file(f.filename.replace(/^\/+/, ""), f.code));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const rawName = (msg.title || currentSession?.title || "vaeltrixai-project").replace(/[^\w\-. ]+/g, "").trim();
    const a = document.createElement("a");
    a.href = url; a.download = (rawName || "vaeltrixai-project").slice(0, 40) + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast("ZIP Berhasil Diunduh, Tuan");
  } catch (e) {
    showToast("Gagal Bikin ZIP: " + (e?.message || "Error Gak Diketahui"), true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
  }
}
