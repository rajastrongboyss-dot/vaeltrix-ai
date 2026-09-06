// ============================================================
// VAELTRIXAI — VOICE INPUT + TEXT TO SPEECH
// Browser TTS Enhanced + ElevenLabs + Automatic Fallback
// ============================================================


// ============================================================
// 1. VOICE INPUT — SPEECH RECOGNITION
// ============================================================

function initSpeechRecognition() {
  const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SR) return null;

  const r = new SR();

  r.lang = "id-ID";
  r.continuous = false;
  r.interimResults = false;

  return r;
}


function toggleVoiceInput() {
  if (isRecording) {
    recognition?.stop();
    return;
  }

  recognition = initSpeechRecognition();

  if (!recognition) {
    showToast(
      "Browser Kamu Belum Support Input Suara",
      true
    );
    return;
  }

  const micBtn = document.getElementById("mic-btn");

  isRecording = true;

  micBtn?.classList.add("recording");


  recognition.onresult = (event) => {
    const transcript =
      event.results?.[0]?.[0]?.transcript || "";

    if (!transcript.trim()) return;

    const input =
      document.getElementById("msg-input");

    if (!input) return;

    input.value =
      input.value
        ? `${input.value} ${transcript}`
        : transcript;

    autoResize(input);
  };


  recognition.onerror = (event) => {
    console.warn(
      "Speech Recognition Error:",
      event?.error
    );

    showToast(
      "Gagal Menangkap Suara, Coba Lagi",
      true
    );
  };


  recognition.onend = () => {
    isRecording = false;

    micBtn?.classList.remove("recording");
  };


  try {
    recognition.start();
  } catch (error) {
    console.warn(
      "Speech Recognition Start Error:",
      error
    );

    isRecording = false;

    micBtn?.classList.remove("recording");
  }
}



// ============================================================
// 2. BROWSER TTS — VOICE ENGINE DETECTION
// ============================================================

function browserTTSAvailable() {
  return (
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}


function getBrowserVoices() {
  if (!browserTTSAvailable()) {
    return [];
  }

  return speechSynthesis.getVoices() || [];
}


// Browser Android/Chrome kadang memuat voice secara asynchronous.
if (browserTTSAvailable()) {
  speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();

    console.log(
      "VaeltrixAI Browser TTS Voices Loaded:",
      voices.length
    );
  };
}



// ============================================================
// 3. BEST BROWSER VOICE
// ============================================================

function getBestBrowserVoice(language) {
  const voices = getBrowserVoices();

  if (!voices.length) {
    return null;
  }

  const targetLanguage =
    language === "en"
      ? "en-US"
      : "id-ID";

  const baseLanguage =
    targetLanguage
      .split("-")[0]
      .toLowerCase();


  // ----------------------------------------------------------
  // Priority 1 — voice yang persis sama
  // ----------------------------------------------------------

  let voice = voices.find(
    (v) =>
      String(v.lang).toLowerCase() ===
      targetLanguage.toLowerCase()
  );

  if (voice) {
    return voice;
  }


  // ----------------------------------------------------------
  // Priority 2 — bahasa yang sama
  // ----------------------------------------------------------

  voice = voices.find(
    (v) =>
      String(v.lang)
        .toLowerCase()
        .startsWith(baseLanguage)
  );

  if (voice) {
    return voice;
  }


  // ----------------------------------------------------------
  // Priority 3 — voice default browser
  // ----------------------------------------------------------

  voice = voices.find(
    (v) => v.default === true
  );

  if (voice) {
    return voice;
  }


  // ----------------------------------------------------------
  // Priority 4 — voice pertama
  // ----------------------------------------------------------

  return voices[0] || null;
}



// ============================================================
// 4. MARKDOWN → SPEECH CLEANER
// ============================================================

function stripMarkdownForSpeech(text) {
  return String(text || "")

    // --------------------------------------------------------
    // Code block
    // --------------------------------------------------------

    .replace(
      /```[\s\S]*?```/g,
      " Bagian kode diabaikan. "
    )


    // --------------------------------------------------------
    // Inline code
    // --------------------------------------------------------

    .replace(
      /`([^`]+)`/g,
      "$1"
    )


    // --------------------------------------------------------
    // Images
    // --------------------------------------------------------

    .replace(
      /!\[([^\]]*)\]\([^)]+\)/g,
      "$1"
    )


    // --------------------------------------------------------
    // Markdown links
    // --------------------------------------------------------

    .replace(
      /\[([^\]]+)\]\([^)]+\)/g,
      "$1"
    )


    // --------------------------------------------------------
    // Headings
    // --------------------------------------------------------

    .replace(
      /^#{1,6}\s*/gm,
      ""
    )


    // --------------------------------------------------------
    // Bold
    // --------------------------------------------------------

    .replace(
      /(\*\*|__)(.*?)\1/g,
      "$2"
    )


    // --------------------------------------------------------
    // Italic
    // --------------------------------------------------------

    .replace(
      /(\*|_)(.*?)\1/g,
      "$2"
    )


    // --------------------------------------------------------
    // Strikethrough
    // --------------------------------------------------------

    .replace(
      /~~(.*?)~~/g,
      "$1"
    )


    // --------------------------------------------------------
    // Blockquote
    // --------------------------------------------------------

    .replace(
      /^\s*>\s?/gm,
      ""
    )


    // --------------------------------------------------------
    // Bullet list
    // --------------------------------------------------------

    .replace(
      /^\s*[-*+]\s+/gm,
      ""
    )


    // --------------------------------------------------------
    // Numbered list
    // --------------------------------------------------------

    .replace(
      /^\s*\d+[.)]\s+/gm,
      ""
    )


    // --------------------------------------------------------
    // Table separator
    // --------------------------------------------------------

    .replace(
      /^\s*\|?[\s:|-]+\|?\s*$/gm,
      ""
    )


    // --------------------------------------------------------
    // Table pipes
    // --------------------------------------------------------

    .replace(
      /\|/g,
      ", "
    )


    // --------------------------------------------------------
    // URLs
    // --------------------------------------------------------

    .replace(
      /https?:\/\/\S+/gi,
      " tautan "
    )


    // --------------------------------------------------------
    // Email
    // --------------------------------------------------------

    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      " alamat email "
    )


    // --------------------------------------------------------
    // Excess whitespace
    // --------------------------------------------------------

    .replace(
      /[ \t]+/g,
      " "
    )

    .replace(
      /\n{3,}/g,
      "\n\n"
    )

    .trim();
}



// ============================================================
// 5. NATURAL SPEECH PREPROCESSOR
// ============================================================

function prepareSpeechText(text) {
  let result =
    stripMarkdownForSpeech(text);


  // ----------------------------------------------------------
  // Common symbols
  // ----------------------------------------------------------

  result = result
    .replace(/&/g, " dan ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " sama dengan ")
    .replace(/%/g, " persen ")
    .replace(/@/g, " at ")
    .replace(/\$/g, " dolar ")
    .replace(/#/g, "")
    .replace(/~/g, "")
    .replace(/\*/g, "");


  // ----------------------------------------------------------
  // Multiple punctuation
  // ----------------------------------------------------------

  result = result
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/\.{3,}/g, "...")
    .replace(/,{2,}/g, ",")
    .replace(/:{2,}/g, ":");


  // ----------------------------------------------------------
  // Natural spacing after punctuation
  // ----------------------------------------------------------

  result = result
    .replace(/;\s*/g, "; ")
    .replace(/:\s*/g, ": ")
    .replace(/,\s*/g, ", ")
    .replace(/!\s*/g, "! ")
    .replace(/\?\s*/g, "? ");


  // ----------------------------------------------------------
  // Normalize whitespace
  // ----------------------------------------------------------

  result = result
    .replace(/\s+/g, " ")
    .trim();


  return result;
}



// ============================================================
// 6. OPTIONAL — SPLIT LONG TEXT
// ============================================================

function splitSpeechText(text, maxLength = 220) {
  const clean =
    String(text || "").trim();

  if (!clean) return [];

  if (clean.length <= maxLength) {
    return [clean];
  }


  const sentences =
    clean.match(
      /[^.!?]+[.!?]+/g
    ) || [clean];


  const chunks = [];
  let current = "";


  for (const sentence of sentences) {
    const part = sentence.trim();

    if (!part) continue;


    if (
      (current + " " + part).trim().length <=
      maxLength
    ) {
      current =
        `${current} ${part}`.trim();
    } else {
      if (current) {
        chunks.push(current);
      }

      current = part;
    }
  }


  if (current) {
    chunks.push(current);
  }


  return chunks;
}



// ============================================================
// 7. STOP ALL VOICE
// ============================================================

function stopAllSpeech() {
  try {
    if (browserTTSAvailable()) {
      speechSynthesis.cancel();
    }
  } catch (error) {
    console.warn(
      "Browser TTS Stop Error:",
      error
    );
  }


  if (currentElevenAudio) {
    try {
      currentElevenAudio.pause();
      currentElevenAudio.currentTime = 0;
    } catch (error) {
      console.warn(
        "ElevenLabs Audio Stop Error:",
        error
      );
    }

    currentElevenAudio = null;
  }


  currentSpeakUtterance = null;


  document
    .querySelectorAll(".speak-btn")
    .forEach((button) => {
      button.classList.remove("speaking");
    });
}



// ============================================================
// 8. MAIN TOGGLE SPEAK
// ============================================================

function toggleSpeak(text, btn) {

  const browserSpeaking =
    currentSpeakUtterance &&
    browserTTSAvailable() &&
    speechSynthesis.speaking;


  const elevenSpeaking =
    currentElevenAudio &&
    !currentElevenAudio.paused;


  const isSpeakingNow =
    browserSpeaking ||
    elevenSpeaking;


  // ----------------------------------------------------------
  // Klik tombol yang sama → STOP
  // ----------------------------------------------------------

  if (
    isSpeakingNow &&
    btn.classList.contains("speaking")
  ) {
    stopAllSpeech();
    return;
  }


  // ----------------------------------------------------------
  // Hentikan voice lain
  // ----------------------------------------------------------

  stopAllSpeech();


  // ----------------------------------------------------------
  // Clean text
  // ----------------------------------------------------------

  const clean =
    prepareSpeechText(text);


  if (!clean) {
    showToast(
      "Tidak Ada Teks Yang Bisa Dibacakan",
      true
    );

    return;
  }


  // ----------------------------------------------------------
  // ElevenLabs
  // ----------------------------------------------------------

  if (
    getVoiceProvider() === "elevenlabs" &&
    getElevenLabsKey()
  ) {
    btn.classList.add("speaking");

    speakWithElevenLabs(
      clean,
      btn
    );

    return;
  }


  // ----------------------------------------------------------
  // Browser TTS
  // ----------------------------------------------------------

  speakWithBrowser(
    clean,
    btn
  );
}



// ============================================================
// 9. BROWSER TTS — ENHANCED NATURAL MODE
// ============================================================

function speakWithBrowser(clean, btn) {

  if (!browserTTSAvailable()) {

    showToast(
      "Browser Kamu Belum Support Text-To-Speech",
      true
    );

    btn.classList.remove("speaking");

    return;
  }


  const text =
    prepareSpeechText(clean);


  if (!text) {
    btn.classList.remove("speaking");
    return;
  }


  // ----------------------------------------------------------
  // Stop previous browser speech
  // ----------------------------------------------------------

  speechSynthesis.cancel();


  const utter =
    new SpeechSynthesisUtterance(text);


  // ----------------------------------------------------------
  // Voice selection
  // ----------------------------------------------------------

  const chosenUri =
    typeof getVoiceURI === "function"
      ? getVoiceURI()
      : null;


  const voices =
    getBrowserVoices();


  let chosenVoice = null;


  if (chosenUri) {
    chosenVoice =
      voices.find(
        (voice) =>
          voice.voiceURI === chosenUri
      );
  }


  if (!chosenVoice) {
    chosenVoice =
      getBestBrowserVoice(
        typeof getLanguage === "function"
          ? getLanguage()
          : "id"
      );
  }


  if (chosenVoice) {
    utter.voice =
      chosenVoice;

    utter.lang =
      chosenVoice.lang;
  } else {

    utter.lang =
      typeof getLanguage === "function" &&
      getLanguage() === "en"
        ? "en-US"
        : "id-ID";
  }


  // ==========================================================
  // NATURAL VOICE SETTINGS
  // ==========================================================

  utter.rate = 0.92;

  utter.pitch = 1.0;

  utter.volume = 1.0;


  // ----------------------------------------------------------
  // Start
  // ----------------------------------------------------------

  utter.onstart = () => {

    btn.classList.add(
      "speaking"
    );
  };


  // ----------------------------------------------------------
  // End
  // ----------------------------------------------------------

  utter.onend = () => {

    btn.classList.remove(
      "speaking"
    );


    if (
      currentSpeakUtterance ===
      utter
    ) {
      currentSpeakUtterance =
        null;
    }
  };


  // ----------------------------------------------------------
  // Error
  // ----------------------------------------------------------

  utter.onerror = (event) => {

    console.warn(
      "Browser TTS Error:",
      event
    );


    btn.classList.remove(
      "speaking"
    );


    if (
      currentSpeakUtterance ===
      utter
    ) {
      currentSpeakUtterance =
        null;
    }


    showToast(
      "Browser Gagal Memutar Suara",
      true
    );
  };


  currentSpeakUtterance =
    utter;


  btn.classList.add(
    "speaking"
  );


  // ----------------------------------------------------------
  // Start speech
  // ----------------------------------------------------------

  try {

    speechSynthesis.speak(
      utter
    );

  } catch (error) {

    console.error(
      "SpeechSynthesis Error:",
      error
    );

    btn.classList.remove(
      "speaking"
    );

    currentSpeakUtterance =
      null;

    showToast(
      "Gagal Memulai Suara Browser",
      true
    );
  }
}



// ============================================================
// 10. ELEVENLABS TTS
// ============================================================

async function speakWithElevenLabs(
  clean,
  btn
) {

  try {

    const voiceId =
      getElevenLabsVoiceId();


    const apiKey =
      getElevenLabsKey();


    if (!apiKey) {
      speakWithBrowser(
        clean,
        btn
      );

      return;
    }


    const res =
      await fetch(
        `${ELEVENLABS_TTS_BASE}/${voiceId}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "xi-api-key":
              apiKey
          },

          body: JSON.stringify({
            text: clean,

            model_id:
              ELEVENLABS_MODEL,

            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        }
      );


    // --------------------------------------------------------
    // API ERROR
    // --------------------------------------------------------

    if (!res.ok) {

      let reason =
        "Gagal Konek Ke ElevenLabs";


      if (res.status === 401) {

        reason =
          "API Key ElevenLabs Salah/Kadaluarsa";

      } else if (res.status === 403) {

        reason =
          "Akses ElevenLabs Ditolak";

      } else if (res.status === 429) {

        reason =
          "Kredit/Kuota ElevenLabs Kamu Abis";

      } else if (res.status >= 500) {

        reason =
          "Server ElevenLabs Sedang Bermasalah";
      }


      showToast(
        `${reason} — Balik Ke Suara Browser`,
        true
      );


      speakWithBrowser(
        clean,
        btn
      );


      return;
    }


    // --------------------------------------------------------
    // Audio Blob
    // --------------------------------------------------------

    const blob =
      await res.blob();


    if (!blob.size) {

      showToast(
        "Audio ElevenLabs Kosong — Balik Ke Suara Browser",
        true
      );


      speakWithBrowser(
        clean,
        btn
      );


      return;
    }


    const url =
      URL.createObjectURL(
        blob
      );


    const audio =
      new Audio(url);


    currentElevenAudio =
      audio;


    // --------------------------------------------------------
    // Audio Start
    // --------------------------------------------------------

    audio.onplay = () => {

      btn.classList.add(
        "speaking"
      );
    };


    // --------------------------------------------------------
    // Audio End
    // --------------------------------------------------------

    audio.onended = () => {

      btn.classList.remove(
        "speaking"
      );


      URL.revokeObjectURL(
        url
      );


      if (
        currentElevenAudio ===
        audio
      ) {
        currentElevenAudio =
          null;
      }
    };


    // --------------------------------------------------------
    // Audio Error
    // --------------------------------------------------------

    audio.onerror = () => {

      btn.classList.remove(
        "speaking"
      );


      URL.revokeObjectURL(
        url
      );


      if (
        currentElevenAudio ===
        audio
      ) {
        currentElevenAudio =
          null;
      }


      showToast(
        "Audio ElevenLabs Gagal — Balik Ke Suara Browser",
        true
      );


      speakWithBrowser(
        clean,
        btn
      );
    };


    // --------------------------------------------------------
    // Play
    // --------------------------------------------------------

    try {

      await audio.play();

    } catch (playError) {

      console.warn(
        "ElevenLabs Audio Play Error:",
        playError
      );


      btn.classList.remove(
        "speaking"
      );


      URL.revokeObjectURL(
        url
      );


      if (
        currentElevenAudio ===
        audio
      ) {
        currentElevenAudio =
          null;
      }


      showToast(
        "Audio Tidak Bisa Diputar — Balik Ke Suara Browser",
        true
      );


      speakWithBrowser(
        clean,
        btn
      );
    }

  } catch (error) {

    console.error(
      "ElevenLabs TTS Error:",
      error
    );


    btn.classList.remove(
      "speaking"
    );


    showToast(
      "Gagal Konek Ke ElevenLabs — Balik Ke Suara Browser",
      true
    );


    // --------------------------------------------------------
    // Universal fallback
    // --------------------------------------------------------

    speakWithBrowser(
      clean,
      btn
    );
  }
}