-- Section 17/24/26 master prompt: billing (Stripe) butuh cara menghubungkan
-- customer Stripe ke user kita, dan usage tracking butuh kolom token per pesan
-- (section 26: "usage data harus bisa dipakai buat quota, analytics").
alter table public.profiles add column if not exists stripe_customer_id text unique;
alter table public.messages add column if not exists tokens integer;

-- Kolom privat/internal (diisi lewat webhook Stripe pakai privileged client,
-- section 10) -- bukan preferensi kayak "settings", jadi TIDAK di-grant ke
-- role authenticated sama sekali (beda dari migration 0003/0005).
