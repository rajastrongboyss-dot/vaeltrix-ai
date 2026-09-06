-- Fix section 17 master prompt: PREMIUM_CODES sebelumnya divalidasi 100% di
-- browser (localStorage.vaeltrix_premium = "true" bisa diset siapa aja lewat
-- devtools, gak butuh kode apa pun). Tier sekarang cuma boleh diubah lewat
-- privileged path di backend (account_service.redeem_code, pakai
-- SUPABASE_SECRET_KEY -- lihat catatan section 10 master prompt).
--
-- RLS row-level SENDIRIAN gak cukup di sini: policy "profiles_update_own"
-- (migration 0002) cuma mastiin user update BARIS miliknya sendiri, TAPI
-- gak membatasi KOLOM apa yang boleh diubah -- tanpa migration ini, user bisa
-- langsung PATCH /rest/v1/profiles?id=eq.<id_dia_sendiri> body {"tier":"pro"}
-- pakai token miliknya sendiri yang sah, dan RLS bakal ALLOW itu.
--
-- Asumsi: project Supabase pakai default privilege standar (role
-- "authenticated" dapat GRANT ALL ON TABLES otomatis dari provisioning
-- Supabase) -- kalau project kamu sudah dikustomisasi dari default itu,
-- sesuaikan REVOKE/GRANT di bawah.
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;
