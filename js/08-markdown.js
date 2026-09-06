// VaeltrixAI — Markdown rendering, syntax highlight, LaTeX

// Pengaman tambahan: kalau AI kelupaan bungkus jawabannya pakai ``` code block padahal isinya
// jelas-jelas 1 dokumen HTML utuh (misal lagi bikin game/app/website), otomatis dibungkusin di
// sini SEBELUM disimpan/dirender — biar gak numplek jadi teks mentah kayak sebelumnya. Sengaja
// heuristiknya ketat (butuh beberapa sinyal HTML kuat sekaligus) biar gak salah bungkus jawaban
// teks/prosa biasa yang kebetulan nyebut kata "script" atau semacamnya.
function autoFenceRawCode(text) {
  if (!text || text.includes("```")) return text; // udah ada code block, gak usah diapa-apain
  const hasDoctype = /<!DOCTYPE\s+html/i.test(text);
  const hasHtmlTag = /<html[\s>]/i.test(text);
  const hasScript = /<script[\s>]/i.test(text);
  const hasStyleOrBody = /<style[\s>]|<body[\s>]/i.test(text);
  // Wajib ada tanda dokumen HTML (doctype/<html>) DITAMBAH minimal 1 sinyal kuat lain, biar aman.
  if ((hasDoctype || hasHtmlTag) && (hasScript || hasStyleOrBody)) {
    return "```html\n" + text.trim() + "\n```";
  }
  return text;
}

// ============ MARKDOWN ============
// Dipanggil BUKAN cuma buat teks final, tapi juga tiap tick pas lagi streaming (lihat
// createTypewriter di 06-chat-core.js) — makanya `t` yang masuk ke sini bisa aja teks
// SETENGAH JADI (mis. baru "```js\nfunction foo() {" doang, fence penutupnya belum sampai).
function parseMarkdown(t) {
  // Fence ``` pembuka tanpa pasangan penutup (masih nunggu chunk berikutnya) bikin regex code
  // block di bawah gak nge-match sama sekali, jadi malah nongol mentah dus backtick-backtick-nya
  // kelihatan. Kalau jumlah ``` di teks ganjil, anggap sementara "ditutup" cuma buat kebutuhan
  // render — biar tetap kebentuk jadi code block yang lagi "nyala" selagi nunggu sisanya, sama
  // kayak ChatGPT/Claude. Ini gak ngubah teks asli yang kesimpen (cuma dipakai buat display).
  const fenceCount = (t.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) t += "\n```";

  // Simpan code blocks dulu sebelum escape
  const codeBlocks = [];
  // Grup 2 (filename) opsional — dukung "```js:server.js" buat proyek multi-file (lihat ATURAN
  // PROYEK MULTI-FILE di FORMAT_GUIDE, 07-providers.js). Kalau gak ada titik dua, perilakunya
  // PERSIS sama kayak sebelumnya (cuma bahasa, tanpa nama file).
  t = t.replace(/```([\w+-]*)(?::([^\n`]+))?\n([\s\S]*?)```/g, (_, lang, filename, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang, filename: filename ? filename.trim() : null, code: code.trim() });
    return `%%CODE_BLOCK_${idx}%%`;
  });

  // Simpan inline code
  const inlineCodes = [];
  t = t.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `%%INLINE_CODE_${idx}%%`;
  });

  // Escape HTML
  let h = escHtml(t);

  // Restore inline code
  inlineCodes.forEach((code, i) => {
    h = h.replace(`%%INLINE_CODE_${i}%%`, `<code>${escHtml(code)}</code>`);
  });

  // Restore code blocks dengan toolbar (copy + preview)
  codeBlocks.forEach((block, i) => {
    const safeCode = escHtml(block.code);
    const lang = (block.lang || "").toLowerCase();
    const code = block.code;
    const isHtml = lang === "html" || lang === "css" || lang === "js" || lang === "javascript" ||
                   code.includes("<!DOCTYPE") || code.includes("<html") || code.includes("<body") ||
                   (code.includes("<style") || code.includes("<script")) && code.includes("<div") ||
                   (code.includes("function") && code.includes("<canvas")) ||
                   (code.includes("<canvas") || code.includes("getElementById"));
    const previewBtn = isHtml ? `<button class="code-icon-btn preview-btn" data-preview="true" title="Preview" aria-label="Preview"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : "";
    // Vaeltrix Artifact — tombol tambahan (BUKAN pengganti Preview/Perbesar di atas), cuma nongol
    // buat blok kode yang cukup panjang biar toolbar gak penuh sesak buat kode 2-3 baris.
    const isArtifactEligible = code.trim().length >= ARTIFACT_MIN_LEN;
    const filenameAttr = block.filename ? ` data-filename="${escHtml(block.filename)}"` : "";
    h = h.replace(`%%CODE_BLOCK_${i}%%`,
      `<div class="code-block-wrap" data-code="${encodeURIComponent(block.code)}"${isArtifactEligible ? ` data-artifact-idx="${i}"` : ""}${filenameAttr}>
        <div class="code-block-header">
          <span class="code-lang-label">${block.filename ? escHtml(block.filename) : (lang || "text")}</span>
          <div class="code-block-actions">
            <button class="code-icon-btn expand-code-btn" title="Perbesar" aria-label="Perbesar Kode"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>
            ${previewBtn}
            <button class="code-icon-btn copy-code-btn" title="Salin" aria-label="Salin Kode"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          </div>
        </div>
        <pre><code class="${lang ? "language-" + lang : ""}">${safeCode}</code></pre>
      </div>`
    );
  });

  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/^---$/gm, '<hr>');
  h = parseMarkdownTables(h);
  h = h.replace(/^\- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>');
  h = h.replace(/<\/ul>\s*<ul>/g, '');
  h = h.replace(/!\[(.*?)\]\((.+?)\)/g, (full, alt, url) => {
    const safe = sanitizeMdUrl(url);
    if (!safe) return full; // URL gak lolos whitelist protokol (mis. javascript:) -> jangan dirender jadi elemen aktif
    return `<img src="${safe}" alt="${alt}" loading="lazy" class="md-image" style="max-width:100%;border-radius:14px;margin:6px 0;cursor:pointer;display:block;">`;
  });
  h = h.replace(/\[(.+?)\]\((.+?)\)/g, (full, label, url) => {
    const safe = sanitizeMdUrl(url);
    if (!safe) return full;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  h = h.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
  h = `<p>${h}</p>`;
  h = h.replace(/<p><\/p>/g,'');
  ['h1','h2','h3','div','ul','blockquote'].forEach(tag => {
    h = h.replace(new RegExp(`<p>(<${tag}[^>]*>)`,'g'),'$1');
    h = h.replace(new RegExp(`(</${tag}>)<\\/p>`,'g'),'$1');
  });
  h = h.replace(/<p>(<hr>)<\/p>/g,'$1');
  return h;
}
// ============ SYNTAX HIGHLIGHT + LATEX ============
function enhanceBubble(bubble) {
  // Syntax highlighting per code block (highlight.js)
  if (window.hljs) {
    bubble.querySelectorAll(".code-block-wrap").forEach(wrap => {
      const rawCode = decodeURIComponent(wrap.dataset.code || "");
      const codeEl = wrap.querySelector("code");
      if (!codeEl || !rawCode) return;
      
      // Cegah highlight berkali-kali pada elemen yang sama
      if (codeEl.dataset.highlighted === "yes") return;
      
      // Deteksi bahasa dari class (language-xxx)
      let lang = "";
      const match = codeEl.className.match(/language-(\w+)/);
      if (match) lang = match[1];
      
      try {
        let result;
        if (lang && hljs.getLanguage(lang)) {
          result = hljs.highlight(rawCode, { language: lang, ignoreIllegals: true });
        } else {
          result = hljs.highlightAuto(rawCode);
        }
        codeEl.innerHTML = result.value;
        codeEl.classList.add("hljs");
        codeEl.dataset.highlighted = "yes";
      } catch (e) {
        // Fallback: tampilkan plain text kalau hljs gagal
        codeEl.textContent = rawCode;
      }
    });
  }

  // Render rumus matematika (KaTeX)
  if (window.renderMathInElement) {
    try {
      renderMathInElement(bubble, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
        throwOnError: false
      });
    } catch (e) { /* biarin teks mentah kalau KaTeX gagal load */ }
  }
}

//============ MARKDOWN TABLES ============
function splitTableRow(line) {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map(c => c.trim());
}
function parseMarkdownTables(h) {
  // Cari blok: baris header | ... | , lalu baris separator | --- | :--: | ---
  const tableRe = /^(\|.+\|)[ \t]*\n(\|[ \t:|-]+\|)[ \t]*\n((?:\|.*\|[ \t]*\n?)+)/gm;
  return h.replace(tableRe, (match, headerLine, sepLine, bodyBlock) => {
    // Validasi baris separator beneran cuma isi -, :, spasi (biar gak nyangkut ke teks biasa yang kebetulan ada |)
    if (!/^\|[ \t:|-]+\|?$/.test(sepLine.trim())) return match;
    const headers = splitTableRow(headerLine);
    const rows = bodyBlock.trim().split("\n").filter(l => l.trim()).map(splitTableRow);
    let out = '<div class="md-table-wrap"><table><thead><tr>';
    out += headers.map(c => `<th>${c}</th>`).join("");
    out += "</tr></thead><tbody>";
    rows.forEach(r => {
      out += "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>";
    });
    out += "</tbody></table></div>";
    return out;
  });
}
function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// Whitelist protokol URL buat link/gambar hasil parse markdown. Cegah skema berbahaya seperti
// javascript:/vbscript:/data: dipakai buat eksekusi kode lewat klik link atau gambar (XSS),
// termasuk dari pesan yang datang lewat link "Share Chat" (bisa dipalsukan siapa aja).
function sanitizeMdUrl(url) {
  const clean = (url || "").trim();
  if (/^https?:\/\//i.test(clean) || /^mailto:/i.test(clean)) return clean;
  return null;
}

function escAttr(s) { return s.replace(/\\/g,"\\\\").replace(/`/g,"\\`"); }

function copyBubble(btn) {
  const text = btn.dataset.text || "";
  copyToClipboard(text).then(() => {
    btn.classList.add("copied");
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Tersalin!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    }, 2000);
  }).catch(() => showToast("Failed Copy", true));
}

// Event delegation untuk code action buttons + gambar hasil markdown
document.addEventListener("click", function(e) {
  const mdImage = e.target.closest(".md-image");
  if (mdImage && mdImage.tagName === "IMG") {
    const safe = sanitizeMdUrl(mdImage.getAttribute("src"));
    if (safe) window.open(safe, "_blank", "noopener,noreferrer");
    return;
  }

  const copyBtn = e.target.closest(".copy-code-btn");
  const previewBtn = e.target.closest(".preview-btn");
  const expandBtn = e.target.closest(".expand-code-btn");

  if (copyBtn) {
    const wrap = copyBtn.closest(".code-block-wrap");
    if (!wrap) return;
    const code = decodeURIComponent(wrap.dataset.code || "");
    copyToClipboard(code).then(() => {
      copyBtn.classList.add("copied");
      copyBtn.title = "Tersalin!";
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.title = "Salin";
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    }).catch(() => showToast("Failed Copy", true));
  }

  if (previewBtn) {
    const wrap = previewBtn.closest(".code-block-wrap");
    if (!wrap) return;
    const code = decodeURIComponent(wrap.dataset.code || "");
    openPreview(code);
  }

  if (expandBtn) {
    const wrap = expandBtn.closest(".code-block-wrap");
    if (!wrap) return;
    const code = decodeURIComponent(wrap.dataset.code || "");
    const codeEl = wrap.querySelector("code");
    const langMatch = codeEl && codeEl.className.match(/language-(\w+)/);
    openCodeExpand(code, langMatch ? langMatch[1] : "");
  }
});

function openPreview(code) {
  const modal = document.getElementById("preview-modal");
  const frame = document.getElementById("preview-frame");
  modal.classList.add("show");
  frame.srcdoc = code;
}

function closePreview() {
  document.getElementById("preview-modal").classList.remove("show");
  document.getElementById("preview-frame").srcdoc = "";
}

function openCodeExpand(code, lang) {
  const modal = document.getElementById("code-expand-modal");
  const codeEl = document.getElementById("code-expand-code");
  const langLabel = document.getElementById("code-expand-lang");
  codeEl.textContent = code;
  codeEl.className = lang ? "language-" + lang : "";
  delete codeEl.dataset.highlighted;
  langLabel.textContent = (lang || "code").toUpperCase();
  modal.dataset.rawCode = encodeURIComponent(code);
  modal.classList.add("show");
  if (window.hljs) { try { hljs.highlightElement(codeEl); } catch (e) {} }
}

function closeCodeExpand() {
  document.getElementById("code-expand-modal").classList.remove("show");
}

function copyExpandedCode() {
  const modal = document.getElementById("code-expand-modal");
  const code = decodeURIComponent(modal.dataset.rawCode || "");
  copyToClipboard(code).then(() => showToast("Tersalin!")).catch(() => showToast("Failed Copy", true));
}


