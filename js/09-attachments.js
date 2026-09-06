// VaeltrixAI — Attachments: file upload/vision, PDF, paste image, image generation

// ============ MENU "+" (TAMBAH KE CHAT) ============
function openAttachMenu() {
  const t = document.getElementById("web-search-toggle");
  if (t) t.checked = isWebSearchEnabled();
  const o = document.getElementById("offline-mode-toggle");
  if (o) o.checked = isOfflineModeEnabled() && isPremium;
  const th = document.getElementById("thinking-toggle");
  if (th) th.checked = isForceThinkingEnabled();
  document.getElementById("attach-menu-backdrop").classList.add("show");
}
function closeAttachMenu() {
  document.getElementById("attach-menu-backdrop").classList.remove("show");
}


// ============ BUAT PROYEK (Multi-File, Kayak Artifacts) ============
// Beda dari Buat Foto/Edit Foto — ini gak butuh mode/API terpisah, cukup isi input dengan
// template prompt. Model udah tau format "```bahasa:nama-file.ext" dari ATURAN PROYEK MULTI-FILE
// di FORMAT_GUIDE (07-providers.js), jadi begitu dikirim lewat jalur chat biasa, jawabannya bakal
// otomatis kedeteksi extractArtifacts()/isProjectMessage() (15-artifacts.js) dan muncul chip
// "N Artefak" di bawah bubble buat buka panel + unduh per-file/ZIP.
function startProjectFlow() {
  closeAttachMenu();
  const input = document.getElementById("msg-input");
  input.value = "Buatkan saya sebuah proyek dengan beberapa file terpisah untuk: ";
  input.focus();
  autoResize(input);
  input.setSelectionRange(input.value.length, input.value.length);
  showToast("Jelasin Proyek Yang Mau Dibikin, Vaeltrix Bakal Pecah Jadi Beberapa File.");
}

// ============ BUAT PHOTO (Pollinations AI) ============
function startImageGenFlow() {
  imageGenMode = true;
  imageEditMode = false; // Buat Foto & Edit Foto saling eksklusif, gak boleh dua-duanya aktif bareng
  closeAttachMenu();
  const input = document.getElementById("msg-input");
  input.placeholder = "Deskripsikan Gambar…";
  input.focus();
  showToast("Mode Buat Foto Aktif, Tulis Deskripsinya.");
}

// encodeURIComponent gak nge-escape ! ' ( ) * — bisa bikin sintaks markdown gambar rusak, jadi di-escape manual
function pollinationsEncode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// ===== PROMPT ENHANCER (Translate + Detail) =====
async function enhanceImagePrompt(userPrompt) {
  // Coba translate ke English pakai Groq dulu (gratis, cepat)
  try {
    const groqKey = localStorage.getItem("vaeltrix_groq_key") || GROQ_KEY;
    const res = await fetch(GROQ_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          { 
            role: "system", 
            content: `Kamu adalah Prompt Engineer untuk AI Image Generation. 
Tugas: Ubah prompt user jadi prompt visual yang detail dalam Bahasa Inggris.
Aturan:
- Tambahkan detail: lighting, style, angle, background, texture
- Jika user minta hewan/objek realistis, tambahkan "photorealistic, highly detailed, 8k, professional photography"
- Jika user minta anime/kartun, tambahkan "anime style, vibrant colors, clean lines"
- Jika user minta lukisan, tambahkan "digital art, masterpiece, trending on artstation"
- JANGAN tambahkan manusia/wajah/kepala/orang kalau user nggak minta
- Output HANYA prompt yang sudah di-enhance, tanpa penjelasan, tanpa tanda kutip di awal/akhir`
          },
          { role: "user", content: `Prompt user: "${userPrompt}"\n\nBuatkan Prompt Visual Dalam Bahasa Inggris Yang Detail:` }
        ],
        max_tokens: 150,
        temperature: 0.5
      })
    });
    const data = await res.json();
    let enhanced = data?.choices?.[0]?.message?.content?.trim() || "";
    // Bersihin tanda kutip dan penjelasan
    enhanced = enhanced.replace(/^["'`]+|["'`]+$/g, "").replace(/^(prompt|enhanced prompt|hasil|result):\s*/i, "").trim();
    if (enhanced.length > 20) return enhanced;
  } catch (e) {
    console.warn("Prompt Enhancement Gagal, Pakai Fallback:", e);
  }
  
  // Fallback: translate manual + tambah detail default
  return `photorealistic image of ${userPrompt}, highly detailed, 8k resolution, professional photography, natural lighting, sharp focus`;
}

// ===== NEGATIVE PROMPT BUILDER =====
function buildNegativePrompt(userPrompt) {
  const lower = userPrompt.toLowerCase();
  let negative = "blurry, low quality, distorted, deformed, ugly, duplicate, watermark, text, logo, signature";
  
  // Kalau user minta hewan/objek (bukan manusia), tambahin ini
  const animalKeywords = ["hewan", "keledai", "kucing", "anjing", "burung", "ikan", "sapi", "kambing", "ayam", "harimau", "singa", "gajah", "monyet"];
  const isAnimal = animalKeywords.some(k => lower.includes(k));
  
  if (isAnimal) {
    negative += ", human, person, people, face, head, body, hands, fingers, man, woman, child, nude, nsfw";
  }
  
  // Kalau user minta pemandangan/lanskap
  if (lower.includes("pemandangan") || lower.includes("lanskap") || lower.includes("alam") || lower.includes("gunung") || lower.includes("pantai")) {
    negative += ", human, person, people, building, car, vehicle, text";
  }
  
  return negative;
}

function generatePollinationsImage(prompt, opts = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Enhance Prompt Dulu
      const enhancedPrompt = await enhanceImagePrompt(prompt);
      const negativePrompt = buildNegativePrompt(prompt);
      
      const seed = Date.now() % 1000000;
      const width = opts.width || 768;
      const height = opts.height || 768;
      
      // URL dengan parameter lengkap
      const url = `https://image.pollinations.ai/prompt/${pollinationsEncode(enhancedPrompt)}` +
        `?width=${width}` +
        `&height=${height}` +
        `&seed=${seed}` +
        `&nologo=true` +
        `&negative_prompt=${pollinationsEncode(negativePrompt)}` +
        `&enhance=true` +        // Pollinations AI enhancement
        `&safe=true`;             // Hindari NSFW
      
      console.log("Pollinations URL:", url); // Buat Debug Di Console
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      // Timeout 30 detik
      const timeout = setTimeout(() => {
        reject(new Error("Timeout — Pollinations Terlalu Lama Merespons. Coba Lagi."));
      }, 30000);
      
      img.onload = () => {
        clearTimeout(timeout);
        resolve(url);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Gagal Generate Gambar. Coba Prompt Yang Lebih Spesifik Dalam Bahasa Inggris."));
      };
      
      img.src = url;
      
    } catch (err) {
      reject(new Error("Gagal generate gambar: " + err.message));
    }
  });
}

async function sendImageGenMessage(prompt) {
  if (!prompt || !prompt.trim()) { 
    showToast("Tulis Dulu Deskripsi Gambarnya Ya", true); 
    return; 
  }
  
  imageGenMode = false;
  const input = document.getElementById("msg-input");
  input.value = ""; 
  input.style.height = "auto"; 
  input.placeholder = "Ask VaeltrixAI...";
  clearDraft();

  if (!currentSession) {
    const t = prompt;
    currentSession = { 
      id: Date.now(), 
      title: t.slice(0,32) + (t.length > 32 ? "…" : ""), 
      messages: [], 
      mode: currentMode 
    };
    sessions.unshift(currentSession); 
    renderHistory();
  }

  const userMsgId = `u${Date.now()}`;
  currentSession.messages.push({ role: "user", content: prompt, mode: currentMode, id: userMsgId });
  appendBubble("user", prompt, currentMode, true, userMsgId);
  trackStat(currentMode);
  isTyping = true; 
  setSendBtnState("stop");
  showTyping(currentMode, "Membuat Gambar...");

  const aiMsgId = `a${Date.now()}`;
  try {
    // Tampilkan "Sedang memproses..." di bubble
    appendBubble("ai", "⏳ Sedang Membuat Gambar, Mohon Tunggu...", currentMode, true, aiMsgId);
    
    const url = await generatePollinationsImage(prompt);
    
    // Hapus bubble "Sedang memproses..."
    document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
    
    // Buat bubble baru dengan gambar
    const md = `![${prompt.replace(/[[\]]/g, "")}](${url})`;
    appendBubble("ai", md, currentMode, true, aiMsgId);
    currentSession.messages.push({ role: "ai", content: md, mode: currentMode, id: aiMsgId });
    saveSessions();
    
    showToast("Gambar Berhasil Dibuat! 🎨");
    
  } catch (err) {
    removeTyping();
    document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
    showToast(err.message || "Gagal Membuat Gambar", true);
  }
  
  isTyping = false; 
  setSendBtnState("send");
  document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
}


// ============ EDIT FOTO (Pollinations AI — image-to-image edit) ============
// Beda dari "Buat Photo" di atas: itu text-to-image dari nol, ini edit foto YANG SUDAH ADA
// (dilampirkan user) berdasarkan instruksi teks. Pakai endpoint /v1/images/edits yang beneran
// support image editing (endpoint /image/prompt lama cuma bisa generate dari nol, gak bisa edit).
function startImageEditFlow() {
  closeAttachMenu();
  imageGenMode = false;
  imageEditMode = true;
  const input = document.getElementById("msg-input");
  input.placeholder = "Tulis Perubahan Yang Kamu Mau (Mis: Ganti Background Jadi Pantai)...";
  input.focus();
  if (pendingAttachments.some(a => a.isImage)) {
    showToast("Mode Edit Foto Aktif — Tulis Instruksi Editnya");
  } else {
    showToast("Pilih Foto Yang Mau Diedit Dulu, Baru Tulis Instruksinya");
    document.getElementById("file-input-photos").click();
  }
}

// Ubah data URL (hasil FileReader.readAsDataURL) jadi Blob — dibutuhin buat masukin ke FormData
// karena endpoint edit Pollinations nerima multipart/form-data, bukan JSON base64.
function dataURLtoBlob(dataUrl) {
  const [header, b64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function editPollinationsImage(sourceDataUrl, prompt) {
  const key = localStorage.getItem("vaeltrix_pollinations_key");
  if (!key) {
    throw new Error("Fitur Edit Foto Butuh API Key Pollinations Dulu. Buka Settings > Custom API Keys, Ambil Key Gratis Tipe pk_ Di enter.pollinations.ai.");
  }

  const fd = new FormData();
  fd.append("image", dataURLtoBlob(sourceDataUrl), "source.png");
  fd.append("prompt", prompt);
  fd.append("model", "kontext"); // model Pollinations yang didesain khusus buat image-to-image edit
  fd.append("response_format", "url");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // edit foto bisa agak lama, kasih 60 detik

  let res;
  try {
    res = await fetch(POLLINATIONS_EDIT_BASE, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}` }, // JANGAN set Content-Type manual — biar browser yang isi boundary multipart-nya
      body: fd,
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Edit Foto Kelamaan (Timeout). Coba Lagi.");
    throw new Error("Gagal Menghubungi Pollinations: " + e.message);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const errJson = await res.json(); msg = errJson?.error?.message || errJson?.message || msg; } catch (e) {}
    if (res.status === 401) msg = "Pollinations Key Kamu Gak Valid Atau Kadaluarsa. Cek Lagi Di Settings.";
    throw new Error(msg);
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("Respons Kosong Dari Pollinations, Coba Lagi.");
}

async function sendImageEditMessage(prompt) {
  const sourceImg = pendingAttachments.find(a => a.isImage);
  if (!sourceImg) { showToast("Belum Ada Foto Yang Dilampirkan Buat Diedit", true); return; }
  if (!prompt || !prompt.trim()) { showToast("Tulis Dulu Instruksi Editnya, Mis: 'Ganti Background Jadi Pantai'", true); return; }

  imageEditMode = false;
  const input = document.getElementById("msg-input");
  input.value = ""; input.style.height = "auto"; input.placeholder = "Ask VaeltrixAI...";
  clearDraft();

  if (!currentSession) {
    currentSession = { id: Date.now(), title: prompt.slice(0,32) + (prompt.length > 32 ? "…" : ""), messages: [], mode: currentMode };
    sessions.unshift(currentSession); renderHistory();
  }

  const userMsgId = `u${Date.now()}`;
  currentSession.messages.push({ role: "user", content: prompt, mode: currentMode, id: userMsgId });
  appendBubble("user", prompt, currentMode, true, userMsgId, [sourceImg.dataUrl]);
  pendingAttachments = []; renderAttachmentChips();
  trackStat(currentMode);
  isTyping = true; setSendBtnState("stop");
  showTyping(currentMode, "Mengedit Foto...");

  const aiMsgId = `a${Date.now()}`;
  try {
    appendBubble("ai", "⏳ Sedang Mengedit Foto, Mohon Tunggu...", currentMode, true, aiMsgId);
    const url = await editPollinationsImage(sourceImg.dataUrl, prompt);
    document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
    const md = `![${prompt.replace(/[[\]]/g, "")}](${url})`;
    appendBubble("ai", md, currentMode, true, aiMsgId);
    currentSession.messages.push({ role: "ai", content: md, mode: currentMode, id: aiMsgId });
    saveSessions();
    showToast("Foto Berhasil Diedit! 🎨");
  } catch (err) {
    removeTyping();
    document.getElementById(`msgwrap-${aiMsgId}`)?.remove();
    showToast(err.message || "Gagal Mengedit Foto", true);
  }

  isTyping = false;
  setSendBtnState("send");
  document.getElementById("chat").scrollTop = document.getElementById("chat").scrollHeight;
}


function selectMode(mode) {
  // P0.2 fix: "research" ketinggalan di kondisi ini — kalau dibiarin, row picker Deep Research yang
  // baru ditambahin bisa dipilih user gratisan tanpa kena paywall (padahal tryDeepResearch(), jalur
  // lama lewat menu lampiran, udah bener ngecek isPremium duluan). Sekarang konsisten sama itu.
  if ((mode === "code" || mode === "maxs" || mode === "research") && !isPremium) {
    closeModeSheet();
    openPremiumModal();
    return;
  }
  setMode(mode);
  closeModeSheet();
}

// Close sheet when clicking backdrop
window.addEventListener("load", () => {
  const sheet = document.getElementById("mode-sheet");
  if (sheet) sheet.addEventListener("click", function(e) {
    if (e.target === this) closeModeSheet();
  });
});

function tryPremiumMode(mode) {
  if (!isPremium) { openPremiumModal(); return; }
  setMode(mode);
}

function tryThinkMode() { tryPremiumMode('code'); }


// ============ FILE UPLOAD / VAELTRIX VISION ============
const TEXT_EXTENSIONS = ["txt","md","csv","json","js","ts","jsx","tsx","py","java","c","cpp","h","css","html","xml","yml","yaml","log","sql","sh"];
function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  files.forEach(processAttachment);
  event.target.value = "";
}
async function processAttachment(file) {
  const maxSize = 15 * 1024 * 1024;
  if (file.size > maxSize) { showToast(`${file.name} Terlalu Besar (Maks 15MB)`, true); return; }
  const ext = file.name.split(".").pop().toLowerCase();
  const item = { name: file.name, type: file.type, isImage: file.type.startsWith("image/") };

  if (item.isImage) {
    const currentImageCount = pendingAttachments.filter(a => a.isImage).length;
    if (currentImageCount >= 5) { showToast("Maksimal 5 Gambar Sekaligus Per Pesan, Tuan", true); return; }
    // VX-VISION-001: sebelumnya baris ini gak dibungkus try/catch — kalau FileReader gagal (file
    // korup, aneh dari beberapa file provider Android, dst), Promise-nya reject, gak ketangkep
    // siapa-siapa (processAttachment dipanggil fire-and-forget dari handleFileSelect), jadi
    // gambarnya diem-diem ilang: gak ada toast, gak masuk pendingAttachments, user gak tau kenapa.
    try {
      item.dataUrl = await readAsDataURL(file);
    } catch (e) {
      console.warn("[VX-VISION-001] Gagal membaca gambar:", file.name, e);
      showToast(`Gagal Membaca Gambar "${file.name}" — Coba File Lain Atau Screenshot Ulang, Tuan.`, true);
      return;
    }
    if (!item.dataUrl || !item.dataUrl.startsWith("data:image/")) {
      // Sangat jarang (FileReader "berhasil" tapi hasilnya bukan data URL gambar valid) — tetap
      // dijaga daripada nanti nyangkut di request API sebagai payload yang gak masuk akal.
      console.warn("[VX-VISION-001] dataUrl gambar gak valid:", file.name);
      showToast(`Gambar "${file.name}" Gak Valid, Coba File Lain, Tuan.`, true);
      return;
    }
  } else if (ext === "pdf") {
    try {
      item.textContent = await extractPdfText(file);
    } catch (e) {
      item.textContent = `[File terlampir: ${file.name} — gagal membaca isi PDF-nya, jelaskan ke Vaeltrix isinya kalau perlu]`;
    }
  } else if (ext === "zip" && window.JSZip) {
    try {
      const zip = await JSZip.loadAsync(file);
      let combined = "";
      const entries = Object.values(zip.files).filter(f => !f.dir);
      for (const entry of entries.slice(0, 20)) {
        const entryExt = entry.name.split(".").pop().toLowerCase();
        if (TEXT_EXTENSIONS.includes(entryExt)) {
          const content = await entry.async("string");
          combined += `\n\n--- ${entry.name} ---\n${content.slice(0, 3000)}`;
        } else {
          combined += `\n\n--- ${entry.name} (binary, isi tidak diekstrak) ---`;
        }
      }
      item.textContent = combined.slice(0, 12000);
    } catch (e) {
      showToast(`Gagal Membaca ZIP: ${file.name}`, true);
      return;
    }
  } else if (TEXT_EXTENSIONS.includes(ext)) {
    item.textContent = (await readAsText(file)).slice(0, 8000);
  } else {
    item.textContent = `[File terlampir: ${file.name} — format ini belum bisa diekstrak isinya secara otomatis, jelaskan ke Vaeltrix isi filenya kalau perlu]`;
  }
  pendingAttachments.push(item);
  renderAttachmentChips();
}

// =========== ANALISIS DOKUMEN PDF (Vaeltrix Document) ============
// Dulu: ekstrak teks lalu asal .slice(0, 12000) — buat dokumen panjang, semua isi SETELAH
// karakter ke-12000 ilang total, gak pernah sampe ke AI. Sekarang: kalau dokumennya pendek,
// tetep dipakai apa adanya (cepat, gak ada biaya tambahan). Kalau panjang, dipecah per-chunk
// (per beberapa halaman) lalu tiap chunk diringkas (map), baru semua ringkasan digabung
// (reduce) — jadi isi dari halaman awal SAMPAI akhir tetap kewakilan, bukan cuma potongan depan.
async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("pdf.js belum siap");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const maxPages = Math.min(pdf.numPages, 60); // dinaikkin dari 25 — ekstraksi teks pdf.js murah, gak kena biaya API
  const pages = [];
  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => it.str).join(" ");
    pages.push({ num: p, text: pageText });
  }
  const notShown = pdf.numPages - maxPages;
  const fullText = pages.map(pg => `\n\n--- Halaman ${pg.num} ---\n${pg.text}`).join("").trim();

  if (!fullText) {
    return "[PDF ini sepertinya hasil scan/gambar — tidak ada teks yang bisa diekstrak langsung]";
  }

  const SAFE_LIMIT = 12000; // dokumen di bawah batas ini gak perlu acara ringkas-ringkasan sama sekali
  if (fullText.length <= SAFE_LIMIT) {
    return notShown > 0
      ? fullText + `\n\n[...${notShown} halaman lagi tidak ditampilkan, dokumen terlalu panjang...]`
      : fullText;
  }

  // ===== CHUNKING: pecah per ~6000 karakter, gak motong di tengah halaman =====
  showToast("Dokumen Panjang — Meringkas Per Bagian Dulu, Tunggu Sebentar...");
  const CHUNK_CHARS = 6000;
  const chunks = [];
  let bufText = "", startPage = pages[0]?.num || 1;
  for (const pg of pages) {
    const piece = `\n\n--- Halaman ${pg.num} ---\n${pg.text}`;
    if (bufText.length + piece.length > CHUNK_CHARS && bufText) {
      chunks.push({ from: startPage, to: pg.num - 1, text: bufText });
      bufText = ""; startPage = pg.num;
    }
    bufText += piece;
  }
  if (bufText) chunks.push({ from: startPage, to: pages[pages.length - 1].num, text: bufText });

  // Batasin jumlah chunk yang diringkas biar 1 file gak trigger puluhan panggilan API sekaligus
  // (boros kuota/token & lama). 8 chunk × ~6000 karakter ≈ cukup buat dokumen puluhan halaman.
  const MAX_CHUNKS = 8;
  const usedChunks = chunks.slice(0, MAX_CHUNKS);
  const skippedChunks = chunks.slice(MAX_CHUNKS);

  // Sengaja SEQUENTIAL (bukan Promise.all) — biar gak nembak banyak request bareng ke Groq
  // dan gampang kena rate limit, apalagi kalau usernya masih pakai key gratis.
  const summaries = [];
  for (const c of usedChunks) {
    try {
      const summary = await summarizePdfChunk(c.text, c.from, c.to);
      summaries.push(`[Hal. ${c.from}-${c.to}]\n${summary}`);
    } catch (e) {
      // Satu chunk gagal diringkas (mis. rate limit) → tetep masukin cuplikan mentahnya
      // (dipendekin) daripada bagian itu ilang total dari hasil akhir.
      summaries.push(`[Hal. ${c.from}-${c.to}, gagal diringkas otomatis — cuplikan mentah]\n${c.text.slice(0, 800)}`);
    }
  }

  let result = `[Dokumen ${pdf.numPages} halaman — diringkas otomatis per bagian karena isinya panjang]\n\n` + summaries.join("\n\n");
  if (skippedChunks.length > 0) {
    result += `\n\n[...${skippedChunks.length} bagian lagi (halaman ${skippedChunks[0].from}-${pages[pages.length - 1].num}) belum sempat diringkas karena dokumen sangat panjang...]`;
  }
  if (notShown > 0) {
    result += `\n\n[...${notShown} halaman lagi di luar ${maxPages} halaman pertama tidak dibaca sama sekali...]`;
  }

  return result.slice(0, 16000); // safety net akhir — normalnya udah jauh di bawah ini
}

// Ringkas satu chunk halaman PDF. Sengaja fetch langsung ke Groq (bukan lewat callGroq/
// buildGroqMessages) karena ini cuma utility ringkas-teks internal — gak perlu system prompt
// persona/format-guide penuh yang dipakai buat jawaban chat ke user.
async function summarizePdfChunk(text, fromPage, toPage) {
  const model = (MODELS.lite && MODELS.lite.models[0]) || "openai/gpt-oss-20b";
  const userGroqKey = localStorage.getItem("vaeltrix_groq_key");
  const key = userGroqKey || GROQ_KEY;
  if (!key) throw new Error("Groq API key belum diatur buat meringkas dokumen");

  const res = await fetch(GROQ_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Kamu meringkas potongan dokumen jadi poin-poin padat berbahasa Indonesia. Pertahankan angka, nama, tanggal, dan istilah penting persis seperti aslinya. Jangan menambahkan opini atau informasi yang tidak ada di teks. Maksimal sekitar 400 kata." },
        { role: "user", content: `Ringkas isi potongan dokumen (halaman ${fromPage}-${toPage}) berikut:\n\n${text}` }
      ],
      max_tokens: 800,
      temperature: 0.3,
      ...(typeof isReasoningModel === "function" && isReasoningModel(model) ? { reasoning_format: "hidden" } : {})
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const outText = data?.choices?.[0]?.message?.content;
  if (!outText) throw new Error("Ringkasan kosong");
  return (typeof stripThinking === "function" ? stripThinking(outText) : outText).trim();
}

function readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function readAsText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
function renderAttachmentChips() {
  const wrap = document.getElementById("attach-preview");
  wrap.innerHTML = pendingAttachments.map((a, i) => `
    <div class="attach-chip">
      ${a.isImage ? `<img src="${a.dataUrl}">` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`}
      <span class="aname">${escHtml(a.name)}</span>
      <button class="aremove" onclick="removeAttachment(${i})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join("");
}
function removeAttachment(i) { pendingAttachments.splice(i, 1); renderAttachmentChips(); }

// ============ PASTE GAMBAR DARI CLIPBOARD ============
async function handlePasteImage(event) {
  const items = event.clipboardData?.items;
  if (!items) return;
  const imageItems = Array.from(items).filter(it => it.type && it.type.startsWith("image/"));
  if (!imageItems.length) return; // Bukan gambar — biarin paste teks jalan flash
  event.preventDefault();
  for (const it of imageItems) {
    const file = it.getAsFile();
    if (file) await processAttachment(file);
  }
  showToast(imageItems.length > 1 ? `${imageItems.length} Gambar Dari Clipboard Ditambahkan` : "Gambar Dari Clipboard Ditambahkan");
}


