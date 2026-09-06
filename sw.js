// ============ VaeltrixAI Service Worker ============
// Bikin app bisa dibuka offline (setelah pernah dibuka online minimal 1x)
// dan bisa di-install sebagai PWA. Tidak pernah cache request non-GET
// (jadi aman, gak ganggu panggilan API AI ke Gemini/Groq/Tavily).

const CACHE_NAME = "vaeltrix-cache-17"; // v1.8.0 — dibump krn banyak file JS/HTML/CSS berubah; kalau gak dibump, user lama tetap kesajiin file LAMA dari cache walau server udah punya versi baru

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Jangan sentuh request non-GET (POST ke API AI, dll) — biarin langsung ke network.
  if (req.method !== "GET") return;

  // Halaman utama (navigasi / reload) → network-first, fallback ke cache pas offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./"))
        )
    );
    return;
  }

  // Aset lain (CSS, font, script CDN seperti jszip/pdf.js/highlight.js/KaTeX, ikon, dan library
  // WebLLM buat Mode Offline) → cache-first biar cepat & tetap kepakai walau offline, tapi tetap
  // diperbarui diam-diam di background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            // Model weight WebLLM (Mode Offline) bisa ratusan MB sampai beberapa GB per file.
            // Sengaja JANGAN ikut ke-cache di sini — WebLLM sudah punya cache storage sendiri
            // yang lebih pas buat file segede itu. Kalau dibiarin ikut numpuk di CACHE_NAME kita,
            // pas app update versi (CACHE_NAME baru) filenya bakal keikut kehapus di cleanup
            // "activate" di atas dan user harus download ulang ratusan MB percuma tiap update app.
            // Threshold 8MB cukup buat nyaring aset kecil (js/css/font) sambil skip file model
            // yang gede — library WebLLM sendiri (~ratusan KB) tetap ke-cache normal di sini.
            const len = parseInt(res.headers.get("content-length") || "0", 10);
            if (len <= 8 * 1024 * 1024) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
