# Security Policy — VaeltrixAI

## Model Keamanan

Backend FastAPI adalah **satu-satunya** authority untuk autentikasi, entitlement (tier),
kuota, rate limit, dan routing provider AI. Asumsi dasarnya: **frontend dianggap 100%
bisa dikuasai/dimodifikasi orang lain** (DevTools, request manual, dsb) — apa pun yang
cuma ditegakkan di frontend adalah UX, bukan proteksi. Kalau backend gak menegakkan
sesuatu secara independen, anggap itu gak ditegakkan sama sekali.

## Melaporkan Kerentanan

Kalau nemu celah keamanan, JANGAN buka issue publik. Hubungi tim VaeltrixLabs langsung
lewat kanal internal yang sudah ada. Sertakan langkah reproduksi & dampak yang mungkin
terjadi kalau memungkinkan.

## Kredensial & Secret

- Semua kredensial milik platform (`GEMINI_API_KEYS`, `GROQ_API_KEYS`,
  `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `PREMIUM_REDEEM_CODES`) **cuma boleh ada di `.env` server**, gak pernah di kode
  frontend (`js/*.js`, `index.html`) atau di-commit ke git (`.env` sudah di
  `.gitignore`).
- `.env` **gak boleh** ikut ke dalam release/build artifact apa pun (zip, image Docker,
  dsb) — kalau proses build/rilis kamu ikut menyertakan `.env`, itu bug di proses
  rilisnya, bukan sesuatu yang "kadang boleh".
- Kalau ada kredensial platform yang KETAHUAN pernah ke-expose (commit lama, release
  lama, screenshot, dsb) — anggap **sudah bocor**, rotasi di dashboard provider terkait,
  jangan cuma dihapus dari kode.
- BYOK (`Settings > Custom API Keys`) itu kredensial MILIK USER, disimpan di
  `localStorage` browser mereka sendiri, dipakai buat manggil provider langsung dari
  browser mereka sendiri. Ini **bukan** celah keamanan platform — risiko dan biayanya
  ada di sisi user, bukan VaeltrixLabs. Jangan pernah campur BYOK dengan kredensial
  platform di kode/config yang sama.

## Autentikasi & Sesi

- Identitas selalu diverifikasi ulang ke Supabase (`get_current_user`) — backend gak
  pernah percaya `user_id` yang dikirim client di body/query.
- Access token cuma disimpan di memory JS (frontend), refresh token di cookie
  `httpOnly` + `Secure` + `SameSite=Lax`, di-scope ke path `/api/v1/auth` saja.
- `/login`, `/register`, `/forgot-password` di-throttle per-IP dan per-email (lihat
  migration `0008`) — kalau nambah endpoint publik baru yang nerima email/kredensial,
  pertimbangkan throttle serupa.
- `/forgot-password` dan `/resend-verification` SELALU balas sukses generik, gak peduli
  emailnya terdaftar atau nggak (anti user-enumeration) — jangan diubah supaya "lebih
  informatif", itu justru kebocoran informasi.

## Data & RLS

- RLS aktif di semua tabel milik user (`profiles`, `projects`, `conversations`,
  `messages`). Tabel internal (`rate_limit_hits`, `processed_stripe_events`,
  `auth_attempt_log`) RLS aktif TANPA policy `authenticated` sama sekali — cuma bisa
  diakses lewat function `security definer` atau `PrivilegedRestClient` (service role).
- `profiles.tier` (dan kolom privileged lain) di-`REVOKE` dari role `authenticated`
  (migration `0003`) — cuma bisa berubah lewat jalur backend yang sudah tervalidasi
  (redeem-code, webhook Stripe), gak pernah lewat `PATCH` langsung dari client.
- Setiap nambah tabel baru: aktifkan RLS dari awal, jangan nunggu "nanti ditambahin".

## Rate Limiting & Idempotensi

- Semua rate limit yang butuh jaminan "gak bisa ditembus pas konkuren" (kuota chat,
  throttle login) diimplementasi sebagai **satu transaksi atomik di Postgres**
  (`security definer` function + advisory lock), BUKAN count-lalu-compare terpisah di
  Python. Kalau nambah rate limit baru, ikuti pola yang sama (lihat migration `0007`
  dan `0008` sebagai referensi) — jangan balik ke pola count-then-act.
- Webhook Stripe idempoten lewat primary key `event_id` (migration `0007`) — kalau
  nambah webhook provider lain, pastikan idempotensi serupa sebelum diproses.

## Input Validation

Field bebas-teks (`message`, `systemPrompt`, judul percakapan, instruksi project, konten
pesan yang di-import) semua punya `max_length` eksplisit di schema Pydantic-nya
(`app/schemas/*.py`) — jangan hapus batas ini walau `MaxBodySizeMiddleware` (2MB, generik
buat semua endpoint) tetap ada sebagai lapisan kedua. Kalau nambah endpoint/field baru
yang nerima teks bebas dari user, kasih `max_length` eksplisit dari awal, jangan andalkan
body-size limit doang.

## .env vs `js/01-config.js` — Apa Yang Boleh Di Mana

`.env` (server) dan `js/01-config.js` (frontend statis, ke-download SEMUA orang yang buka
app-nya) itu DUA DUNIA TERPISAH — gak ada mekanisme apa pun buat frontend statis baca isi
`.env` server. Aturan pembagiannya:

- **Wajib `.env` doang, HARAM ada di `01-config.js`**: apa pun yang kalau ketahuan orang
  bisa dipakai buat nyolong akses/biaya — `GEMINI_API_KEYS`, `GROQ_API_KEYS`,
  `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `PREMIUM_REDEEM_CODES`, dst. Ini sudah
  dikosongin semua dari `01-config.js` (lihat komentar di file itu).
- **Boleh (bahkan WAJIB) di `01-config.js`**: URL endpoint PUBLIK provider (`GEMINI_BASE`,
  `GROQ_BASE`, dst — sama publiknya kayak dokumentasi API resmi Google/Groq), daftar
  model & kapabilitasnya (buat UI), ID preset suara ElevenLabs, limit lokal buat UX
  (`FREE_LIMIT`/`PREMIUM_LIMIT`), state aplikasi (sessions, folders, stats). Kalau nilai
  itu gak mempermalukan siapa pun atau gak bisa dipakai nyolong apa pun kalau publik, dia
  BUKAN kandidat pindah ke `.env` — malah kalau dipindah beneran, fitur BYOK bisa rusak
  (frontend butuh tau URL provider buat manggil pakai key milik USER sendiri).

**Jangan hapus/kosongin `01-config.js` secara keseluruhan** — minimal 9 file JS lain
(`04` sampai `17`) bergantung ke constant di file ini; app bakal error total kalau ini
hilang. Kalau ada kekhawatiran spesifik soal isi file ini di masa depan, cek satu-satu
per baris (bukan asumsi "semua yang di 01-config.js pasti sensitif").

## Belum Diputuskan — Butuh Keputusan Produk (Bukan Sekadar Bug)

- **System prompt authority (section 10)**: `payload.systemPrompt` dari request
  `/api/v1/chat/stream` dikirim APA ADANYA ke provider AI — gak ada instruksi
  internal/baseline VaeltrixAI yang backend gabungkan/suntikkan sendiri di depannya
  (lihat komentar di `chat_service.py` persis di titik `stream_fn(...)` dipanggil).
  **Update setelah ditelusuri lebih jauh**: isi `systemPrompt` itu sendiri BUKAN cuma
  instruksi user — dia hasil `buildSystemPrompt(mode)` (`07-providers.js`) yang
  gabungin persona + FORMAT_GUIDE + `getMemoryBlock()` + `getLanguageAddon()`, semua
  dibangun CLIENT-SIDE, TERMASUK bagian yang sebetulnya konten platform (persona,
  FORMAT_GUIDE), bukan cuma custom instruction user. Artinya siapa pun yang manggil
  endpoint ini langsung (curl/Postman) bisa ngirim `systemPrompt` KOSONG atau APA PUN,
  dan backend gak punya cara mastiin persona/FORMAT_GUIDE resmi VaeltrixAI tetap
  kepakai. Batas panjangnya sudah ada (4000 karakter, murni validasi, section 19).
  **Ini BUKAN "tulis kebijakan baru dari nol"** — persona/FORMAT_GUIDE-nya SUDAH ada
  isinya (di `buildSystemPrompt()`), tinggal soal ARSITEKTUR: mau dipindah biar
  backend yang nyuntikkan versi non-bisa-ditimpa dari salinan konten yang sama, atau
  tetap terima ini sebagai batasan produk yang dianggap oke (given semua chat user
  yang login toh tetap lewat UI resmi dalam pemakaian normal). Itu keputusan
  VaeltrixLabs, bukan sesuatu yang aku putuskan sendiri di sini.

## Sudah Ditelusuri, Aman (Biar Gak Dicek Ulang / Gak Disalahcurigai)

- **XSS lewat rendering markdown AI** (section 57): `parseMarkdown()` (`js/08-markdown.js`)
  escape SELURUH teks (`escHtml`: `&`/`<`/`>`/`"`) SEBELUM transformasi markdown apa
  pun, lalu URL link/gambar disaring lewat whitelist protokol (`sanitizeMdUrl`: cuma
  `https://`/`mailto:` yang lolos, `javascript:`/`data:`/dst ditolak). Komentar kode
  bahkan nyebut ini sengaja dikerasin karena "Share Chat" link bisa dipalsukan siapa
  aja. Preview code block jalan di iframe `sandbox="allow-scripts allow-modals"` TANPA
  `allow-same-origin` — kode yang dipreview gak bisa nyentuh cookie/localStorage
  halaman utama. Diperiksa, tidak diubah.
- **CSRF** (section 56): satu-satunya endpoint yang pakai cookie (`credentials:
  "include"`) adalah refresh/logout auth (`/api/v1/auth/*`, cookie di-scope ke path
  itu doang). SEMUA endpoint lain (chat, provider call, dst) pakai `Authorization:
  Bearer <token>` dari memory JS — gak otomatis ke-attach browser ke request lintas
  situs, jadi secara desain gak rawan CSRF klasik. Dampak CSRF ke refresh/logout pun
  terbatas (paksa logout/refresh, gak bocorin apa pun ke penyerang). Diperiksa, tidak
  diubah.
- **Cloud sync** (section 43): `SYNCABLE_SETTINGS_KEYS` (`js/18-cloud-sync.js`) whitelist
  eksplisit, cuma preferensi UI (theme, font size, dst) — komentarnya sendiri secara
  eksplisit melarang nambah key BYOK apa pun ke situ. Diperiksa, tidak diubah.
- **Docker** (section 53): non-root user, healthcheck ke `/api/v1/health`, `.env` gak
  ke-`COPY` ke image. Diperiksa, tidak diubah.
- **Validasi env saat startup** (section 27): `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`
  wajib (Pydantic raise kalau kosong). `/api/v1/health` beneran ngetes konektivitas
  Supabase (bukan cuma "app hidup") dan sekarang JUGA ngecek minimal satu dari
  `GEMINI_API_KEYS`/`GROQ_API_KEYS` keisi — kalau kosong dua-duanya, chat 100% mati
  tapi SEBELUMNYA health check gak pernah ngasih tau itu. Docker `HEALTHCHECK` bakal
  nangkep ini dalam hitungan puluhan detik, bukan nunggu user pertama komplain.

## Perbaikan Section 20-22 (Context, Updated_at)

- **Batas history AI** (section 20): request chat sekarang cuma kirim 40 pesan
  terakhir ke model (`CHAT_HISTORY_LIMIT`, `chat_service.py`) — sebelumnya SELURUH
  percakapan ke-fetch tanpa batas, bisa kena limit context window provider atau
  nambah biaya token gak perlu di percakapan yang udah sangat panjang.
- **`conversations.updated_at`** (section 22): trigger `touch_updated_at` udah ada
  dari migration `0001`, tapi cuma nyala kalau baris `conversations` di-UPDATE
  LANGSUNG — kirim pesan baru gak pernah nyentuh itu sebelumnya, jadi urutan sidebar
  gak pernah refleksiin chat yang baru aktif. Sekarang di-touch eksplisit tiap pesan
  user baru masuk.
- **Pagination** (section 21): SEKARANG cursor-based (`GET /conversations?cursor=...`,
  `nextCursor` di response) — sebelumnya `limit` sederhana tanpa mekanisme lanjutan,
  jadi user dengan >50 percakapan ter-sync gak bakal keambil semuanya pas login di
  device baru. `vaeltrixSyncConversationList()` (`18-cloud-sync.js`) sekarang looping
  pakai cursor sampai habis (dibatasi 20 halaman/1000 percakapan sekali sync, jaga-jaga).

## Content-Security-Policy — Sengaja Belum Ditambah

Section 58 minta header keamanan termasuk CSP. 4 header lain (`X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, + `Strict-Transport-Security`
kalau production) SUDAH ditambah (`SecurityHeadersMiddleware`, `main.py`) — CSP
**sengaja tidak**, karena frontend ini pakai `onclick="..."` inline di HAMPIR SEMUA
tombol (ratusan titik di `index.html`). CSP yang benar (`script-src` tanpa
`unsafe-inline`) bakal mematikan hampir semua interaksi app ini. Pasang CSP yang
benar butuh revisi arsitektur event dulu (pindah ke `addEventListener` +
nonce/hash per script), lalu diverifikasi jalan di browser beneran — bukan
sesuatu yang aman ditambal di level middleware doang tanpa itu.

## Batasan Yang Sengaja Diterima (Bukan Bug)

- Jalur redeem kode buat **guest** (belum login) masih pakai list lokal ter-XOR di
  `js/01-config.js` — secara teknis "gak beneran rahasia", tapi diterima karena guest
  gak pernah bisa nyentuh kuota berbayar platform (gak ada sesi server buat digantungin
  tier). Efeknya kosmetik doang. Kalau nanti guest mode dikasih akses ke sesuatu yang
  beneran costly, keputusan ini WAJIB ditinjau ulang.
- Throttle login/register (migration `0008`) pakai threshold tetap, bukan progressive
  delay yang naik bertahap tiap kegagalan — cukup buat brute-force kasar, bukan
  perlindungan paling canggih yang mungkin.
- Search/voice/image gen gak lewat backend gateway — ElevenLabs & Pollinations murni
  BYOK/keyless (gak ada kredensial platform buat dilindungi), Tavily juga sudah gak ada
  kredensial platform lagi (dikosongin, fallback ke DuckDuckGo). Membuatnya jadi fitur
  backend-mediated (kuota resmi buat user login) tetap mungkin sebagai pengembangan
  produk, bukan perbaikan keamanan.

## Belum Ditest Terhadap Infrastruktur Nyata

Sebagian besar perubahan di atas ditulis dalam sandbox tanpa akses internet dan tanpa
dependency proyek (fastapi/httpx/stripe/pytest) ter-install — tervalidasi lewat
pembacaan manual + syntax check, **belum pernah dieksekusi** terhadap Supabase/Stripe
asli. Jalankan test suite (`pytest`) dan test manual end-to-end di environment kamu
sendiri sebelum deploy. Detail lengkap ada di `MIGRATION_REPORT.md`.
