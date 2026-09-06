-- Section 18 master prompt fix -- login/register/forgot-password sebelumnya
-- gak punya proteksi brute-force/spam sama sekali (gak ada throttle per-IP
-- maupun per-email). Pola sama persis kayak migration 0007
-- (check_and_reserve_rate_limit) -- count+catat jadi SATU transaksi atomik
-- pakai advisory lock, bedanya identifier di sini IP/email (teks bebas),
-- BUKAN auth.uid(), karena orang yang lagi nyoba login belum tentu punya
-- sesi buat auth.uid() itu sendiri. Makanya function ini TIDAK di-grant ke
-- role authenticated/anon -- cuma bisa dipanggil lewat PrivilegedRestClient
-- (service role) dari backend, gak pernah langsung dari browser.

create table if not exists public.auth_attempt_log (
  id bigint generated always as identity primary key,
  identifier text not null,   -- alamat IP client ATAU email yang dicoba, tergantung pemanggilan
  endpoint text not null,     -- 'login' | 'register' | 'forgot_password'
  created_at timestamptz not null default now()
);

create index if not exists auth_attempt_log_lookup_idx
  on public.auth_attempt_log (identifier, endpoint, created_at);

alter table public.auth_attempt_log enable row level security;
-- Sengaja TIDAK ada policy buat authenticated/anon SAMA SEKALI.

create or replace function public.check_and_log_auth_attempt(
  p_identifier text,
  p_endpoint text,
  p_max_attempts int,
  p_window_minutes int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - make_interval(mins => p_window_minutes);
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_identifier || ':' || p_endpoint));

  select count(*) into v_count
    from public.auth_attempt_log
    where identifier = p_identifier and endpoint = p_endpoint and created_at >= v_window_start;

  if v_count >= p_max_attempts then
    return false;
  end if;

  insert into public.auth_attempt_log (identifier, endpoint) values (p_identifier, p_endpoint);
  delete from public.auth_attempt_log where created_at < now() - interval '24 hours';
  return true;
end;
$$;

-- CATATAN: sengaja TIDAK ada "grant execute ... to authenticated/anon" di sini
-- -- beda dari check_and_reserve_rate_limit (migration 0007) yang memang harus
-- dipanggil pakai token user. Function ini cuma boleh lewat service role.
