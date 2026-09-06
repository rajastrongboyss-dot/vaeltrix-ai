-- Section 17 & 25 master prompt fix -- dua celah yang ketauan pas audit:
--
-- 1) check_rate_limit() lama (entitlement_service.py) itu COUNT baris messages
--    lalu compare ke limit di Python, di DUA request terpisah (query lalu
--    insert belakangan). Klasik TOCTOU: N request konkuren buat user yang sama
--    semua bisa lolos count yang SAMA sebelum satu pun ke-reservasi (lihat
--    section 50 test case "100 simultaneous requests" -- limit 20/jam bisa
--    ditembus jauh lebih dari 20 kalau dikirim bersamaan). Function di bawah
--    gabungin count+reservasi jadi SATU transaksi atomik (advisory lock
--    per-user, cuma nahan request lain milik user YANG SAMA yang bentrok
--    persis di milidetik yang sama -- lepas begitu function ini selesai,
--    BUKAN dipegang selama streaming AI berlangsung).
--
-- 2) handle_webhook() (billing_service.py) verifikasi signature Stripe dengan
--    benar, tapi gak nyimpen catatan event mana yang UDAH diproses -- retry
--    Stripe (timeout endpoint kita, atau replay manual) bisa "checkout.session.
--    completed" yang sama diproses dua kali. Tabel kedua di bawah pakai
--    event_id Stripe sebagai primary key -- insert kedua ke ID yang sama
--    otomatis gagal (409 unique violation), itu yang jadi penanda "udah pernah".

-- ---------------------------------------------------------------------------
-- Rate limit atomik
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_user_created_idx
  on public.rate_limit_hits (user_id, created_at);

alter table public.rate_limit_hits enable row level security;
-- Sengaja TIDAK ada policy buat role "authenticated" -- satu-satunya jalan
-- masuk yang dibuka adalah function security definer di bawah (pola sama
-- persis kayak handle_new_user() di migration 0001).

create or replace function public.check_and_reserve_rate_limit(p_limit int, p_window_minutes int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_start timestamptz := now() - make_interval(mins => p_window_minutes);
  v_count int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Advisory lock scoped ke TRANSAKSI function ini doang (xact, bukan
  -- session) -- otomatis lepas pas function ini return, gak pernah numpuk.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select count(*) into v_count
    from public.rate_limit_hits
    where user_id = v_user_id and created_at >= v_window_start;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (user_id) values (v_user_id);
  -- Beresin baris basi sekalian tiap kepanggil -- window kita cuma hitungan
  -- jam, jadi apa pun yang lebih tua dari 24 jam pasti udah gak relevan buat
  -- window mana pun. Gak butuh cron job terpisah buat maintenance sesimpel ini.
  delete from public.rate_limit_hits where created_at < now() - interval '24 hours';
  return true;
end;
$$;

grant execute on function public.check_and_reserve_rate_limit(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Idempotensi webhook Stripe
-- ---------------------------------------------------------------------------
create table if not exists public.processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;
-- Sama kayak stripe_customer_id (migration 0006) -- murni internal, diakses
-- PrivilegedRestClient (service-role) doang, TIDAK ada policy buat authenticated.
