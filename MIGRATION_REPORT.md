# VaeltrixAI 1.0.8 — Laporan Migrasi Arsitektur & Keamanan

**Basis:** Audit + remediasi terhadap `VaeltrixAI-1.0.8-x-Release.zip` (118 file, ~1.1MB).
**Catatan metodologi penting:** Seluruh pekerjaan ini dikerjakan di sandbox **tanpa akses
jaringan** dan **tanpa dependency proyek terinstall** (fastapi/httpx/stripe/pytest semua
gak ada, gak bisa di-install juga karena gak ada internet). Artinya semua perubahan kode
di sini **tervalidasi lewat pembacaan manual + `py_compile`/`node --check` (sintaks) +
penelusuran logika**, TAPI **belum pernah benar-benar dieksekusi** terhadap Supabase/
Stripe/Gemini/Groq asli atau lewat `pytest` beneran. Ini bukan checklist "sudah production
ready" — ini checklist "siap ditest lalu di-deploy oleh kamu".

---

## 1. Arsitektur Sebelum

Bukan proyek yang 100% frontend-only dari nol — begitu dibongkar, ternyata **migrasi
backend-first ini sudah separuh jalan** sebelum sesi ini dimulai (kemungkinan hasil sesi
AI-assisted sebelumnya, dilihat dari komentar kode yang mereferensikan nomor section
"master prompt" yang beda dari dokumen yang dipakai sesi ini). Kondisi sebelum sesi ini:

- **Backend FastAPI sudah ada** dengan auth (register/login/OAuth/logout/refresh via
  Supabase asli), entitlement/tier server-side, model registry, chat streaming (SSE) yang
  sudah correctly pakai kunci Gemini/Groq dari env (dengan rotasi multi-key), billing
  Stripe dengan verifikasi signature asli.
- **Tapi**: `.env` asli ikut ke-bundle di release zip (berisi Supabase secret key, Gemini
  key, Groq key, kode redeem premium — semua dalam keadaan terisi/live).
- **Frontend** (vanilla JS, 18 file bernomor + 1 `index.html` ~114KB) masih punya jalur
  "gratis tanpa login" yang manggil Gemini/Groq/Tavily **langsung dari browser** pakai
  3 kredensial VaeltrixLabs yang **di-hardcode literal** di `js/01-config.js`
  (`DEFAULT_KEY`/`DEFAULT_KEY2`, `GROQ_KEY`, `TAVILY_KEY`) — siapa pun bisa ambil dari
  DevTools/View Source, tanpa rate limit apa pun karena panggilannya gak lewat backend.
- Autentikasi cuma berupa **modal** di dalam app (`#account-modal`), bukan halaman
  dedicated — gak ada forgot-password sama sekali (endpoint maupun UI).
- `check_rate_limit()` backend: count baris `messages` lalu compare di Python (race
  condition di request konkuren). Webhook Stripe: signature diverifikasi tapi gak ada
  pencatatan event yang sudah diproses (rawan double-processing kalau Stripe retry).

## 2. Arsitektur Sesudah

- Backend tetap satu-satunya authority untuk auth/entitlement/quota/model routing
  (sudah begitu sebelumnya, dipertahankan).
- Halaman auth dedicated (`/login /register /forgot-password /reset-password
  /auth/callback`) menggantikan modal sebagai entry point utama; modal jadi murni
  account-management buat user yang sudah login.
- Jalur "gratis tanpa login" via kredensial VaeltrixLabs **dihapus total**. Yang tersisa
  cuma dua jalur legit: **login** (lewat backend, kuota resmi) atau **BYOK** (`Settings >
  Custom API Keys`, kredensial milik user sendiri, sudah ada sejak awal dan TIDAK diubah).
- Rate limit & webhook processing sekarang atomik di level database (Postgres function +
  primary-key constraint), bukan check-then-act terpisah di Python.

## 3. Secret Yang Ditemukan

| Kredensial | Lokasi | Status |
|---|---|---|
| Supabase secret key (`sb_secret_...`) | `.env` di dalam release zip | Live, terisi |
| Gemini key (`AQ.Ab8RN6LX...`) | `.env` **dan** hardcode literal di `js/01-config.js` (x2, `DEFAULT_KEY`/`DEFAULT_KEY2`) | Live, terisi, browser-visible |
| Groq key (`gsk_1toNstGP...`) | `.env` **dan** hardcode literal di `js/01-config.js` | Live, terisi, browser-visible |
| Tavily key (`tvly-dev-4AJVXG...`) | Hardcode literal di `js/01-config.js` saja (gak pernah ada di backend config) | Live, terisi, browser-visible |
| `PREMIUM_REDEEM_CODES` | `.env` | Terisi (nilai pendek, kemungkinan sisa test) |

ElevenLabs dan Pollinations **diperiksa juga** tapi ternyata gak pernah punya kredensial
platform sama sekali — ElevenLabs murni BYOK (`getElevenLabsKey()` cuma baca localStorage
user), Pollinations memang keyless dari sononya. Gak ada yang perlu dihapus di situ.

## 4. Secret Yang Dihapus Dari Kode

- `DEFAULT_KEY`, `DEFAULT_KEY2`, `GROQ_KEY`, `TAVILY_KEY` di `js/01-config.js` dikosongin
  (`""`), dengan komentar yang jelasin kenapa & apa efeknya buat guest/BYOK.
- **PENTING**: ini menghapus nilainya dari KODE, bukan MEROTASI kredensial aslinya di
  provider. Key yang sempat ke-expose tetap valid/bisa dipakai sampai kamu rotasi manual
  (lihat #5). Sandbox ini gak punya akses ke dashboard Google AI Studio/Groq/Tavily/
  Supabase kamu, jadi ini gak bisa dikerjakan dari sisi aku.
- `.env` **tidak** ikut dibundle ulang ke output zip mana pun sesi ini (dicek eksplisit
  tiap kali repackage) — tapi akar masalahnya (proses/skrip yang bikin release zip ikut
  nyertain `.env`) ada di TOOLING kamu, bukan di kode yang aku sentuh, jadi belum
  diperbaiki di sini.

## 5. Kredensial Yang WAJIB Dirotasi (belum dikerjakan, harus kamu lakukan)

1. Supabase secret key (Project Settings > API)
2. Gemini API key (Google AI Studio)
3. Groq API key (console.groq.com)
4. Tavily API key (app.tavily.com)

Setelah rotasi, isi nilai BARU ke `.env` server (backend) kamu — **JANGAN** ke
`js/01-config.js` lagi.

## 6. Panggilan Provider Langsung Yang Dihapus Dari Frontend

Cuma yang benar-benar pakai kredensial PLATFORM yang dihapus (lihat #4) — panggilan BYOK
milik user sendiri (Gemini/Groq/Tavily/ElevenLabs/OpenRouter pakai key user) **sengaja
dipertahankan apa adanya**, itu memang arsitektur BYOK yang benar & sudah terpisah rapi
dari kredensial platform sejak awal (section 14 spec awal, sudah dipatuhi):

- `callGeminiAPI`/`callGroq`/`callUtilityModel` (07-providers.js) & `enhanceImagePrompt`
  (09-attachments.js): fallback ke `DEFAULT_KEY`/`GROQ_KEY` dihapus (sekarang string
  kosong, jadi otomatis gak pernah "berhasil" fallback ke situ) — sudah masing-masing
  punya pesan error manusiawi yang SUDAH ada sebelumnya buat kasus "belum ada key".
- `tavilySearch` (12-search.js): fallback ke `TAVILY_KEY` dihapus — otomatis jatuh ke
  `duckduckgoSearch()` (keyless) yang sudah ada sebagai fallback.

Tidak ada backend gateway baru untuk search/voice/image — dianggap **di luar scope
perbaikan keamanan** karena TIDAK ada kredensial platform yang perlu dilindungi di jalur
itu lagi. Membangun search sebagai fitur backend-mediated (kuota resmi buat user login,
gak perlu Tavily key sendiri) tetap dimungkinkan sebagai **fitur baru**, bukan perbaikan
bug — belum dikerjakan.

## 7. Backend Endpoint Baru

- `POST /api/v1/auth/forgot-password` — trigger email reset via Supabase (`/auth/v1/recover`), selalu balas sukses generik (anti user-enumeration).
- `POST /api/v1/auth/reset-password` — verifikasi token recovery lalu set password baru (reuse `update_user_password` yang sudah ada).

## 8-9. Environment Variable

Tidak ada variabel baru ditambah/dihapus dari `.env.example` sesi ini — kedua endpoint
baru di atas reuse konfigurasi Supabase yang sudah ada.

## 10. Perubahan Autentikasi

- Halaman dedicated `/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/auth/callback` (`css/auth.css` baru, markup di `index.html`, routing di
  `js/17-account.js`) — desain pakai token warna/font yang SUDAH ada di brand (`--blue`
  #D97757, Syne, DM Sans), bukan palet baru.
- `openAccountModal()` sekarang redirect ke `/login` kalau belum login — modal jadi murni
  account management.
- Forgot/reset password: fitur baru penuh (backend + frontend), sebelumnya gak ada sama
  sekali.
- Asumsi desain: project Supabase pakai implicit flow (token di URL hash) — konsisten
  sama OAuth callback yang sudah ada sebelumnya. Kalau nanti pindah ke PKCE flow, dua-duanya
  perlu diubah bareng.

## 11. Perubahan Billing

- Idempotensi webhook ditambahkan (lihat #13). Tidak ada perubahan lain ke logic billing
  yang sudah ada (checkout, subscription state, dll — semua itu sudah benar sebelumnya).

## 12. Perubahan Rate Limiting

- `check_rate_limit()` (`entitlement_service.py`): dari count-then-compare (race) jadi
  satu panggilan RPC ke Postgres function `check_and_reserve_rate_limit` (migration 0007)
  yang atomik (advisory lock per-user, identitas dari `auth.uid()` bukan parameter).
- `RestClient` (`supabase_client.py`) dapat method baru: `rpc()`.
- **Update (section 18)**: `/login`, `/register`, `/forgot-password` sekarang throttle
  ganda (per-IP DAN per-email, threshold beda-beda) lewat function serupa,
  `check_and_log_auth_attempt` (migration 0008) — dipanggil lewat `PrivilegedRestClient`
  karena identitasnya IP/email, bukan `auth.uid()` (belum tentu ada sesi saat mencoba
  login). Error 429-nya otomatis muncul di halaman `/login` dkk yang sudah dibuat
  sebelumnya — `vxAuthFetch` di frontend sudah otomatis nge-surface `error.message` dari
  respons manapun, gak perlu perubahan frontend tambahan.

## 13. Perubahan Database

Migration baru: `supabase/migrations/0007_atomic_backend_fixes.sql`
- Tabel `rate_limit_hits` (user_id, created_at) + function `check_and_reserve_rate_limit`.
- Tabel `processed_stripe_events` (event_id sebagai primary key) — insert kedua ke event
  ID yang sama otomatis gagal (409), itu jadi penanda "sudah diproses" (dipakai di
  `billing_service.handle_webhook`).

Migration baru: `supabase/migrations/0008_login_abuse_protection.sql`
- Tabel `auth_attempt_log` (identifier, endpoint, created_at) + function
  `check_and_log_auth_attempt` — pola sama kayak 0007, tapi identifier-nya IP/email
  (teks bebas), bukan `auth.uid()`, dan function-nya SENGAJA gak di-grant ke role
  `authenticated`/`anon` sama sekali (cuma lewat service role/`PrivilegedRestClient`).

**Belum dijalankan ke Supabase project asli — kamu yang perlu apply migration ini.**

## 14. Perubahan RLS

Kedua tabel baru di atas: RLS enabled, TANPA policy untuk role `authenticated` (pola sama
persis kayak `stripe_customer_id`/migration 0006) — satu-satunya akses lewat function
`security definer` (rate limit) atau `PrivilegedRestClient`/service-role (webhook events).
Tidak ada perubahan ke RLS policy yang sudah ada sebelumnya.

## 15. Testing Yang Ditambahkan

- `test_entitlement.py`: 3 test baru buat `check_rate_limit()` (mock `db.rpc()`).
- `test_billing.py` (baru): 2 test buat idempotensi webhook (mock `PrivilegedRestClient`
  + `stripe.Webhook.construct_event`) — event duplikat diabaikan diam-diam, error lain
  (bukan 409) tetap ke-raise.
- `test_middleware.py` (baru): 3 test buat `MaxBodySizeMiddleware` (panggil `.dispatch()`
  langsung, tanpa `TestClient`) — termasuk test yang jujur mendokumentasikan batasannya
  sendiri (bypass lewat chunked transfer encoding tanpa `Content-Length`).
- `tests/integration/test_rls_cross_user.py` (baru, subfolder terpisah): 3 test RLS
  lintas-user (conversations SELECT, projects SELECT, conversations UPDATE) sesuai
  contoh section 49 persis — **butuh project Supabase TEST asli**, skip otomatis kalau
  env var-nya kosong. Semua test lain di atas pakai mock, murni logic, gak butuh DB.
- `test_schemas.py`: 9 test baru buat batas panjang input (section 19) yang sebelumnya
  gak ada sama sekali di `message`, `systemPrompt`, judul percakapan, instruksi project,
  konten pesan import, jumlah pesan per import.
- `test_middleware.py`: ditambah 2 test buat `SecurityHeadersMiddleware` (section 58) —
  header standar selalu ada, HSTS cuma muncul kalau `APP_ENV=production`.
- `test_conversation_pagination.py` (baru): 5 test buat cursor pagination (section 21) —
  roundtrip encode/decode, cursor invalid ditolak, `nextCursor` cuma muncul kalau
  beneran ada halaman berikutnya, filter `or=` PostgREST terbentuk benar.
- Semua test di atas (kecuali RLS integration) **tervalidasi lewat `py_compile` +
  penelusuran logika manual, belum pernah dieksekusi lewat `pytest` beneran** —
  dependency proyek (fastapi/httpx/stripe/pytest) gak bisa di-install di sandbox ini
  (gak ada internet). Test RLS integration malah belum pernah dicoba sama sekali
  (butuh project Supabase yang gak aku punya).

## 16. Technical Debt Yang Tersisa

- Markup+fungsi form login/register versi lama di dalam `#account-modal` jadi dead code
  (gak kepanggil lagi) — aman dibiarin, enaknya dihapus pas cleanup berikutnya.
- `PREMIUM_CODES` (XOR-obfuscated) di `01-config.js` **sengaja dipertahankan** — masih
  aktif dipakai jalur redeem GUEST-only di `04-settings.js`, dan komentar kode sendiri
  sudah jujur ngakuin ini "gak beneran rahasia" tapi gak pernah nyentuh kuota berbayar
  platform. Risikonya sekarang kosmetik doang (guest bisa fake toast "Premium Aktif"),
  bukan finansial — keputusan produk, bukan bug, jadi gak disentuh.
- **Section 10 (system prompt authority) — belum dikerjakan, butuh keputusan produk
  dulu**: `payload.systemPrompt` dikirim apa adanya ke provider. Setelah ditelusuri,
  isinya BUKAN cuma instruksi user — hasil `buildSystemPrompt()` (frontend) yang gabung
  persona+FORMAT_GUIDE (konten platform yang SUDAH ada) + memory + instruksi user jadi
  satu string, semua dibangun client-side. Backend gak punya cara mastiin
  persona/FORMAT_GUIDE resmi tetap kepakai kalau endpoint dipanggil langsung (bukan
  lewat UI). Batas panjangnya sudah ada (section 19). Ini soal ARSITEKTUR (pindah
  logic constructionnya ke backend atau terima sebagai batasan) — bukan nulis konten
  baru dari nol, tapi tetap keputusan VaeltrixLabs, bukan aku. Detail di `SECURITY.md`.
- **Section 56-57 (CSRF, XSS) — ditelusuri, TIDAK ada perubahan diperlukan**: markdown
  AI di-escape penuh sebelum dirender + whitelist protokol URL (`js/08-markdown.js`,
  sudah ada, dibangun dengan sadar-ancaman — komentarnya sendiri nyebut "Share Chat"
  link forgeable). Semua endpoint kecuali refresh/logout pakai Bearer token dari
  memory JS, bukan cookie — gak rawan CSRF klasik by design. Diverifikasi, gak disentuh.
- Login/register abuse protection (rate limit per-IP/per-email, section 18)
  **sudah ditambahkan** (lihat #12-13) — belum pernah dites di lingkungan nyata, dan ini
  threshold TETAP (bukan progressive delay yang naik bertahap tiap kegagalan) — cukup
  buat brute-force/spam kasar, tapi bukan implementasi paling canggih yang mungkin.
- **Content-Security-Policy (section 58) sengaja belum ditambah**: frontend pakai
  `onclick="..."` inline di hampir semua tombol — CSP yang benar butuh revisi
  arsitektur event dulu (`addEventListener` + nonce/hash), bukan ditambal di
  middleware doang. 4 header lain (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, HSTS-kalau-production) sudah ditambah.
- Proses/skrip yang bikin `.env` ikut ke release zip belum diperbaiki (di luar kode yang
  bisa aku sentuh dari sini — itu tooling/CI kamu).

## 17. Risiko Keamanan Tersisa

- **Paling mendesak**: 4 kredensial di #5 masih VALID sampai kamu rotasi manual — fix
  kode di sini mencegah paparan lebih lanjut LEWAT APP, tapi gak mencabut akses siapa pun
  yang mungkin udah nyalin key-nya sebelum fix ini.
- Kode migration 0007/0008 + endpoint forgot/reset-password + throttle login belum pernah
  dieksekusi sama sekali di lingkungan nyata — wajib ditest sebelum production.

## 18. Yang Perlu Kamu Kerjakan Sebelum Deploy

1. Rotasi 4 kredensial (#5), isi ulang di `.env` server (bukan kode).
2. `supabase db push` (atau setara) buat apply `0007_atomic_backend_fixes.sql` DAN
   `0008_login_abuse_protection.sql`.
3. `pip install -r requirements.txt && pytest` beneran di lokal/CI kamu.
4. Test kirim ~100 request chat konkuren buat satu user, pastikan rate limit ke-enforce
   dengan benar (section 50).
5. Cek template email "Reset Password" di Supabase Dashboard > Authentication > Email
   Templates — pastikan redirect URL-nya cocok sama domain production kamu.
6. Perbaiki proses bikin release zip biar `.env` gak ikut lagi ke depannya.
