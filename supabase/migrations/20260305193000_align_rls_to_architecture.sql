alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.books enable row level security;
alter table public.user_books enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "books_read_all" on public.books;
create policy "books_read_all"
on public.books
for select
to anon, authenticated
using (true);

drop policy if exists "books_write_authenticated" on public.books;

drop policy if exists "user_books_select_own" on public.user_books;
create policy "user_books_select_own"
on public.user_books
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_books_insert_own" on public.user_books;
create policy "user_books_insert_own"
on public.user_books
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_books_update_own" on public.user_books;
create policy "user_books_update_own"
on public.user_books
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user_books_delete_own" on public.user_books;
create policy "user_books_delete_own"
on public.user_books
for delete
to authenticated
using (user_id = auth.uid());
