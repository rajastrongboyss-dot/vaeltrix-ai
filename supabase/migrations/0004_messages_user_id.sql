-- Denormalisasi user_id ke messages (selain lewat conversations.user_id) --
-- dibutuhkan section 26 (rate limiting): hitung berapa pesan yang dikirim
-- SATU user dalam 1 jam terakhir, LINTAS SEMUA percakapannya, secara efisien
-- lewat PostgREST count=exact. Join manual gak praktis dilakukan lewat REST
-- API biasa tanpa RPC function -- ini alternatif yang lebih simpel & robust.
alter table public.messages add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Backfill baris yang mungkin sudah ada dari migration sebelumnya.
update public.messages m
set user_id = c.user_id
from public.conversations c
where m.conversation_id = c.id and m.user_id is null;

alter table public.messages alter column user_id set not null;

create index if not exists messages_user_id_role_created_idx
  on public.messages (user_id, role, created_at);

-- Perketat RLS insert: cross-check DUA arah (kolom user_id baru INI, dan
-- kepemilikan conversation seperti sebelumnya) -- defense in depth, bukan
-- gantiin yang lama.
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
