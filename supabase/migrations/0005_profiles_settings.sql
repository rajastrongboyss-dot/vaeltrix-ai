-- Section 14/15 master prompt: sync preferensi lintas device (theme, bahasa,
-- persona, dst) sebagai satu blob JSONB -- nambah setting baru di frontend
-- nanti gak perlu migration baru tiap kali.
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- Beda dari "tier" (migration 0003): "settings" cuma preferensi, gak ada
-- implikasi keamanan/billing, jadi aman diupdate lewat token user sendiri.
grant update (settings) on public.profiles to authenticated;
