// VaeltrixAI — Vaeltrix Projects/Workspace
// Grup beberapa chat + instruksi khusus (system prompt) + file referensi jadi satu ruang kerja,
// mirip Projects di Claude/ChatGPT. Semua fungsi di file ini SENGAJA berdiri sendiri (gak nyentuh
// logika inti chat kecuali 1 baris kecil di sendMessage buat nyuntik context project) biar fitur
// yang udah ada gak keganggu sama sekali kalau ada bug di sini.

function saveProjects() {
  safeStorageSet("vaeltrix_projects", projects);
}

function openProjectsPanel() {
  projectDetailId = null;
  document.getElementById("projects-detail-view").style.display = "none";
  document.getElementById("projects-list-view").style.display = "block";
  document.getElementById("new-project-input-row").style.display = "none";
  renderProjectsList();
  document.getElementById("projects-backdrop").classList.add("show");
  if (!isDesktopLayout()) closeSidebar();
}

function closeProjectsPanel() {
  document.getElementById("projects-backdrop").classList.remove("show");
}

function renderProjectsList() {
  const wrap = document.getElementById("projects-list");
  wrap.innerHTML = "";
  if (!projects.length) {
    wrap.innerHTML = `<div class="search-empty">Belum Ada Project. Bikin Satu Buat Ngumpulin Chat + Instruksi Khusus + File Referensi Kamu.</div>`;
    return;
  }
  projects.forEach(p => {
    const chatCount = sessions.filter(s => s.projectId === p.id).length;
    const d = document.createElement("div");
    d.className = "export-opt";
    d.onclick = () => openProjectDetail(p.id);
    d.innerHTML = `
      <div class="qp-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg></div>
      <div><div class="qp-title">${escHtml(p.name)}</div><div class="qp-desc">${chatCount} Chat${p.files?.length ? " · " + p.files.length + " File" : ""}</div></div>`;
    wrap.appendChild(d);
  });
}

function startCreateProject() {
  const row = document.getElementById("new-project-input-row");
  row.style.display = "flex";
  const input = document.getElementById("new-project-name-input");
  input.value = "";
  input.focus();
  input.onkeydown = (e) => { if (e.key === "Enter") confirmCreateProject(); };
}

function confirmCreateProject() {
  const input = document.getElementById("new-project-name-input");
  const name = input.value.trim();
  if (!name) { showToast("Nama Project Gak Boleh Kosong", true); return; }
  const proj = { id: Date.now(), name, instructions: "", files: [], createdAt: Date.now() };
  projects.unshift(proj);
  saveProjects();
  document.getElementById("new-project-input-row").style.display = "none";
  renderProjectsList();
  openProjectDetail(proj.id);
  // Phase 4 (cloud sync): kalau login, bikin juga di backend -- non-blocking, UI lokal udah jalan
  // duluan (gak nunggu network). backendProjectId ke-isi begitu selesai, dipakai saveProjectInstructions()/
  // deleteProjectConfirm() nanti buat tau ini project mana di server.
  if (typeof isVaeltrixLoggedIn === "function" && isVaeltrixLoggedIn() && typeof vaeltrixApiFetch === "function") {
    vaeltrixApiFetch("/projects", { method: "POST", body: { name } })
      .then(data => { proj.backendProjectId = data.project.id; saveProjects(); })
      .catch(e => console.warn("VaeltrixAI: gagal bikin project di backend (tetap kepake lokal).", e));
  }
}

function openProjectDetail(id) {
  const proj = projects.find(p => p.id === id);
  if (!proj) return;
  projectDetailId = id;
  document.getElementById("projects-list-view").style.display = "none";
  document.getElementById("projects-detail-view").style.display = "block";
  document.getElementById("project-detail-name").textContent = proj.name;
  document.getElementById("project-instructions-input").value = proj.instructions || "";
  document.getElementById("project-detail-start-chat-btn").onclick = () => startChatInProject(proj.id);
  renderProjectFilesList(proj);
  renderProjectSessionsList(proj);
  // Phase 4 (cloud sync): project ini bisa aja masih "stub" hasil sync backend (instruksi
  // lengkapnya belum ditarik) -- tarik sekarang, kotak instruksi ke-update otomatis begitu selesai.
  if (proj.remoteOnly && typeof vaeltrixHydrateRemoteProject === "function") {
    vaeltrixHydrateRemoteProject(proj.id);
  }
}

function backToProjectsList() {
  projectDetailId = null;
  document.getElementById("projects-detail-view").style.display = "none";
  document.getElementById("projects-list-view").style.display = "block";
  renderProjectsList();
}

function saveProjectInstructions() {
  const proj = projects.find(p => p.id === projectDetailId);
  if (!proj) return;
  proj.instructions = document.getElementById("project-instructions-input").value.trim();
  saveProjects();
  showToast("Instruksi Project Tersimpan");
  // Phase 4 (cloud sync): propagasi ke backend kalau project ini kesambung ke sana.
  if (proj.backendProjectId && typeof vaeltrixApiFetch === "function") {
    vaeltrixApiFetch(`/projects/${proj.backendProjectId}`, { method: "PATCH", body: { instructions: proj.instructions } })
      .catch(e => console.warn("VaeltrixAI: gagal update instruksi project di backend.", e));
  }
}

function renderProjectFilesList(proj) {
  const wrap = document.getElementById("project-files-list");
  wrap.innerHTML = "";
  if (!proj.files?.length) { wrap.innerHTML = `<div class="mem-empty">Belum Ada File Referensi.</div>`; return; }
  proj.files.forEach((f, idx) => {
    const d = document.createElement("div");
    d.className = "mem-item";
    d.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ${escHtml(f.name)}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.setAttribute("aria-label", "Hapus File " + f.name);
    btn.onclick = () => removeProjectFile(idx);
    d.appendChild(btn);
    wrap.appendChild(d);
  });
}

function renderProjectSessionsList(proj) {
  const wrap = document.getElementById("project-sessions-list");
  wrap.innerHTML = "";
  const linked = sessions.filter(s => s.projectId === proj.id);
  if (!linked.length) { wrap.innerHTML = `<div class="mem-empty">Belum Ada Chat Di Project Ini.</div>`; return; }
  linked.forEach(s => {
    const d = document.createElement("div");
    d.className = "search-result-item";
    d.style.marginBottom = "6px";
    d.onclick = () => { closeProjectsPanel(); loadSession(s.id); };
    d.innerHTML = `<div class="search-result-title" style="color:var(--white);">${escHtml(s.title)}</div>`;
    wrap.appendChild(d);
  });
}

// Ekstraksi teks file referensi project. Sengaja dibikin ringan & mandiri (bukan manggil ulang
// readAsText di 09-attachments.js) biar gak gantungin urutan/behavior file attachment normal —
// project cuma butuh baca file teks biasa, bukan gambar/PDF.
function handleProjectFileSelect(event) {
  const proj = projects.find(p => p.id === projectDetailId);
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!proj || !files.length) return;
  if ((proj.files?.length || 0) + files.length > 8) { showToast("Maksimal 8 File Per Project", true); return; }
  let pending = files.length;
  files.forEach(file => {
    if (file.size > 1024 * 1024) { showToast(`${file.name} Kelewat Besar (Maks 1MB)`, true); pending--; if (pending === 0) finishProjectFileAdd(proj); return; }
    const reader = new FileReader();
    reader.onload = () => {
      proj.files = proj.files || [];
      proj.files.push({ name: file.name, textContent: String(reader.result || "").slice(0, 8000) });
      pending--;
      if (pending === 0) finishProjectFileAdd(proj);
    };
    reader.onerror = () => { pending--; if (pending === 0) finishProjectFileAdd(proj); };
    reader.readAsText(file);
  });
}
function finishProjectFileAdd(proj) {
  saveProjects();
  renderProjectFilesList(proj);
  showToast("File Referensi Ditambahkan");
}

function removeProjectFile(idx) {
  const proj = projects.find(p => p.id === projectDetailId);
  if (!proj) return;
  proj.files.splice(idx, 1);
  saveProjects();
  renderProjectFilesList(proj);
}

function deleteProjectConfirm() {
  const proj = projects.find(p => p.id === projectDetailId);
  if (!proj) return;
  if (!confirm(`Hapus Project "${proj.name}"? Chat Di Dalamnya TIDAK Ikut Terhapus, Cuma Dilepas Dari Project.`)) return;
  sessions.forEach(s => { if (s.projectId === proj.id) delete s.projectId; });
  saveSessions();
  projects = projects.filter(p => p.id !== proj.id);
  saveProjects();
  backToProjectsList();
  showToast("Project Dihapus");
  // Phase 4 (cloud sync): propagasi hapus ke backend kalau project ini kesambung ke sana.
  if (proj.backendProjectId && typeof vaeltrixApiFetch === "function") {
    vaeltrixApiFetch(`/projects/${proj.backendProjectId}`, { method: "DELETE" })
      .catch(e => console.warn("VaeltrixAI: gagal hapus project di backend (tetap kehapus lokal).", e));
  }
}

function startChatInProject(id) {
  const proj = projects.find(p => p.id === id);
  currentSession = { id: Date.now(), title: "Chat Baru", messages: [], mode: "lite", projectId: id };
  sessions.unshift(currentSession);
  setMode("lite");
  pendingAttachments = []; renderAttachmentChips();
  trackNewChatStat();
  saveSessions(); renderHistory(); renderChat();
  localStorage.setItem("vaeltrix_last_session_id", currentSession.id);
  closeProjectsPanel();
  if (!isDesktopLayout()) closeSidebar();
  showToast(`Chat Baru Di Project "${proj?.name || ""}"`);
}

// Dipanggil dari sendMessage() (06-chat-core.js) buat nyuntik instruksi + file project ke context
// yang dikirim ke AI. Dibikin fail-safe (return string kosong) biar kalaupun datanya aneh, gak
// bikin proses kirim pesan gagal.
function buildProjectContext(proj) {
  try {
    if (!proj) return "";
    let ctx = `[PROJECT AKTIF: ${proj.name}]`;
    // proj.instructions itu instruksi yang DISENGAJA diatur sendiri oleh pemilik project buat
    // ngarahin AI-nya — itu beda dari file referensi di bawah, jadi SENGAJA gak dibungkus
    // wrapUntrustedContext (dia MEMANG instruksi asli, bukan konten luar yang perlu dicurigai).
    if (proj.instructions) ctx += `\nInstruksi Khusus Project Ini (Ikuti Selama Chat Di Project Ini):\n${proj.instructions}`;
    if (proj.files?.length) {
      // File yang di-upload ke Project ini beda cerita — isinya bisa aja dokumen dari luar
      // (hasil download, scan, dsb) yang berpotensi ngandung teks yang nyamar jadi instruksi.
      const filesText = proj.files.map(f => `[${f.name}]\n${(f.textContent || "").slice(0, 4000)}`).join("\n\n");
      ctx += "\n\n" + wrapUntrustedContext("File Referensi Project", filesText);
    }
    return ctx;
  } catch (e) { return ""; }
}
