// VaeltrixAI — Vaeltrix Live (Voice Mode Dua Arah)
// Loop: Dengar (Speech-To-Text) -> Kirim Ke AI -> Vaeltrix Ngomong (Text-To-Speech) -> Ulang.
// SENGAJA gak numpang ke fungsi toggleSpeak/sendMessage yang ada (11-voice.js, 06-chat-core.js) —
// dibikin jalur sendiri yang mandiri, biar mode ini rusak duluan sebelum fitur chat teks/Play
// Voice biasa ikut kesenggol.
//
// Batasan Versi Ini (jujur dari awal, bukan disembunyiin): belum ada barge-in otomatis (motong
// omongan AI cuma dengan ngomong lagi) — buat interupsi, tap tombol mic gede-nya buat langsung
// balik dengerin.

function isLiveSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function openLiveMode() {
  if (isSharedView) return;
  if (!isLiveSupported()) { showToast("Browser Kamu Belum Support Voice Recognition Buat Vaeltrix Live", true); return; }
  if (isTyping) { showToast("Tunggu Balasan Chat Yang Lagi Diproses Dulu Ya", true); return; }

  if (!currentSession) {
    currentSession = { id: Date.now(), title: "Vaeltrix Live", messages: [], mode: "lite" };
    sessions.unshift(currentSession);
    saveSessions(); renderHistory();
    localStorage.setItem("vaeltrix_last_session_id", currentSession.id);
  }

  liveModeOpen = true;
  liveStopRequested = false;
  liveMuted = false;
  liveConsecutiveFails = 0;
  document.getElementById("live-mute-btn").classList.remove("muted");
  setLiveState("idle", "Menyiapkan...");
  document.getElementById("live-caption").textContent = "";
  document.getElementById("live-voice-overlay").classList.add("show");
  if (!isDesktopLayout()) closeSidebar();

  startLiveListening();
}

function closeLiveMode() {
  liveModeOpen = false;
  liveStopRequested = true;
  // Sembunyiin panelnya DULUAN, paling pertama, sebelum apapun lagi — biar apapun yang error di
  // bawah ini (recognition/audio/render), tombol Close tetap selalu berhasil nutup overlay-nya.
  try { document.getElementById("live-voice-overlay")?.classList.remove("show"); } catch (e) {}
  clearTimeout(liveRestartTimer); liveRestartTimer = null;
  try { liveRecognition?.abort(); } catch (e) {}
  try { liveRecognition?.stop(); } catch (e) {}
  liveRecognition = null;
  try { if (speechSynthesis?.speaking) speechSynthesis.cancel(); } catch (e) {}
  if (currentElevenAudio) { try { currentElevenAudio.pause(); } catch (e) {} currentElevenAudio = null; }
  try { renderChat(); } catch (e) {}
  try { renderHistory(); } catch (e) {}
}

function toggleLiveMute() {
  try {
    liveMuted = !liveMuted;
    document.getElementById("live-mute-btn")?.classList.toggle("muted", liveMuted);
    clearTimeout(liveRestartTimer); liveRestartTimer = null;
    if (liveMuted) {
      try { liveRecognition?.abort(); } catch (e) {}
      try { liveRecognition?.stop(); } catch (e) {}
      setLiveState("idle", "Mic Dibisukan! Tap Mic Buat Lanjut..");
    } else {
      liveConsecutiveFails = 0;
      startLiveListening();
    }
  } catch (e) {
    showToast("Ada Masalah Kecil Di Vaeltrix Live! Coba Tap Lagi Atau Tutup..", true);
  }
}

// Jadwalin startLiveListening() lagi TAPI dikasih jeda (makin lama makin gede kalau gagal
// beruntun) — INI PERBAIKAN UTAMANYA. Sebelumnya restart dipanggil langsung tanpa jeda sama
// sekali, jadi kalau ada error yang gak ketangkep (bukan no-speech/not-allowed/audio-capture),
// dia bisa restart ratusan kali per detik tanpa henti di belakang layar — itu yang bikin Vaeltrix
// Live keliatan "gak bisa diklik" dan bikin seluruh app (termasuk ngetik) jadi berat/lag.
function scheduleLiveRestart() {
  if (!liveModeOpen || liveMuted || liveStopRequested) return;
  liveConsecutiveFails++;
  if (liveConsecutiveFails >= 6) {
    showToast("Vaeltrix Live Kesulitan Konek Ke Microphone! Coba Lagi Nanti..", true);
    closeLiveMode();
    return;
  }
  clearTimeout(liveRestartTimer);
  const delay = Math.min(300 * liveConsecutiveFails, 2500); // 300ms, 600ms, ... maks 2.5 detik
  liveRestartTimer = setTimeout(() => {
    if (!liveModeOpen || liveMuted || liveStopRequested) return;
    startLiveListening();
  }, delay);
}

function setLiveState(state, label) {
  liveState = state;
  const orb = document.getElementById("live-orb");
  orb.className = "live-orb state-" + state;
  document.getElementById("live-status-label").textContent = label || "";
}

function startLiveListening() {
  if (!liveModeOpen || liveMuted || liveStopRequested) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  liveRecognition = new SR();
  liveRecognition.lang = getLanguage() === "en" ? "en-US" : "id-ID";
  liveRecognition.continuous = false;
  liveRecognition.interimResults = true;

  let finalText = "";
  let settled = false; // jaga-jaga biar onerror+onend gak dobel proses buat 1 siklus yang sama
  const caption = document.getElementById("live-caption");

  liveRecognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    caption.textContent = (finalText + interim).trim();
  };

  liveRecognition.onerror = (e) => {
    if (settled) return;
    settled = true;
    if (e.error === "not-allowed" || e.error === "audio-capture" || e.error === "service-not-allowed") {
      showToast("Akses Mic Ditolak/Gak Ketemu! Vaeltrix Live Ditutup...", true);
      closeLiveMode();
    }
    // Error lain (no-speech/aborted/network/dst) sengaja diserahin ke onend di bawah buat restart
    // TERJADWAL (pakai jeda), bukan langsung — ini kuncinya biar gak ada loop tanpa henti.
  };

  liveRecognition.onend = () => {
    if (!liveModeOpen || liveMuted || liveStopRequested) return;
    const text = finalText.trim();
    if (text) {
      liveConsecutiveFails = 0;
      handleLiveUserSpeech(text).catch(() => {
        showToast("Vaeltrix Live Kena Gangguan, Coba Ngomong Lagi", true);
        scheduleLiveRestart();
      });
    } else {
      scheduleLiveRestart(); // gak ada suara kedengeran / error — restart dijadwalin pakai jeda, gak langsung
    }
  };

  setLiveState("listening", "Mendengarkan...");
  caption.textContent = "";
  try { liveRecognition.start(); } catch (e) { scheduleLiveRestart(); }
}

async function handleLiveUserSpeech(text) {
  if (!currentSession) return;
  setLiveState("thinking", "Vaeltrix Mikir...");

  const userMsgId = `u${Date.now()}`;
  currentSession.messages.push({ role: "user", content: text, mode: "lite", id: userMsgId });
  saveSessions();

  let extraContext = "";
  if (currentSession.projectId) {
    const proj = projects.find(p => p.id === currentSession.projectId);
    if (proj) extraContext = buildProjectContext(proj);
  }

  let replyText = "";
  try {
    const historyForApi = currentSession.messages.filter(m => !m.pending);
    const result = await callGemini(historyForApi, "lite", { extraContext, rawText: text }, null, null);
    replyText = (typeof result === "string") ? result : (result?.text || "");
    replyText = autoFenceRawCode(replyText);
  } catch (err) {
    replyText = "Maaf, Vaeltrix Gagal Konek Buat Jawab Ini. Coba Ngomong Lagi Ya...";
  }
  if (!replyText.trim()) replyText = "Maaf, Vaeltrix Belum Nangkep Jawabannya. Coba Ulangi Lagi...";

  const aiMsgId = `a${Date.now()}`;
  currentSession.messages.push({ role: "ai", content: replyText, mode: "lite", id: aiMsgId });
  saveSessions();

  if (currentSession.messages.length === 2 && !currentSession.titleGenerated) generateSmartTitle(currentSession);

  if (!liveModeOpen) return;
  setLiveState("speaking", "Vaeltrix Bicara...");
  document.getElementById("live-caption").textContent = stripMarkdownForSpeech(replyText).slice(0, 220);
  await liveSpeak(replyText);

  if (liveModeOpen && !liveMuted && !liveStopRequested) startLiveListening();
}

// Jalur TTS mandiri khusus Live Mode (gak manggil toggleSpeak/speakWithElevenLabs di 11-voice.js
// biar file itu gak perlu diubah/digantungin sama sekali) — tapi tetap ikut pilihan provider
// (ElevenLabs/Browser) & suara yang user pilih di Settings > Play Voice.
function liveSpeak(text) {
  return new Promise(async (resolve) => {
    const clean = stripMarkdownForSpeech(text);
    if (getVoiceProvider() === "elevenlabs" && getElevenLabsKey()) {
      try {
        const voiceId = getElevenLabsVoiceId();
        const res = await fetch(`${ELEVENLABS_TTS_BASE}/${voiceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": getElevenLabsKey() },
          body: JSON.stringify({ text: clean, model_id: ELEVENLABS_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
        });
        if (!res.ok) throw new Error("eleven-live-fail");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentElevenAudio = audio;
        audio.onended = () => { URL.revokeObjectURL(url); if (currentElevenAudio === audio) currentElevenAudio = null; resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); if (currentElevenAudio === audio) currentElevenAudio = null; resolve(); };
        await audio.play();
        return;
      } catch (e) { /* jatuh ke Browser TTS di bawah */ }
    }
    if (!("speechSynthesis" in window)) { resolve(); return; }
    const utter = new SpeechSynthesisUtterance(clean);
    const chosenUri = getVoiceURI();
    const chosenVoice = chosenUri ? (speechSynthesis.getVoices() || []).find(v => v.voiceURI === chosenUri) : null;
    if (chosenVoice) { utter.voice = chosenVoice; utter.lang = chosenVoice.lang; }
    else { utter.lang = getLanguage() === "en" ? "en-US" : "id-ID"; }
    currentSpeakUtterance = utter;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}
