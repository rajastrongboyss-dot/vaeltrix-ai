-- VaeltrixAI -- Row Level Security
-- Section 10 master prompt: RLS BUKAN satu-satunya lapisan (lihat juga
-- pengecekan eksplisit di conversation_service.py untuk project_id), tapi WAJIB
-- tetap ada sebagai penegakan di level database.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- profiles: baca/update baris sendiri saja. Insert ditangani trigger
-- (security definer), bukan lewat RLS user biasa. Tidak ada delete manual --
-- ikut kehapus lewat "on delete cascade" dari auth.users.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- projects: CRUD penuh, scoped ke pemilik
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);

create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);

create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- conversations: CRUD penuh, scoped ke pemilik
create policy "conversations_select_own" on public.conversations
  for select using (auth.uid() = user_id);

create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = user_id);

create policy "conversations_update_own" on public.conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "conversations_delete_own" on public.conversations
  for delete using (auth.uid() = user_id);

-- messages: scoped lewat kepemilikan conversation induknya (tidak ada
-- kolom user_id sendiri di tabel ini -- sengaja, biar single source of truth
-- kepemilikan tetap di conversations).
create policy "messages_select_own" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_insert_own" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_delete_own" on public.messages
  for delete using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
