create table if not exists public.user_searches (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null,
  searched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_searches_user_id_searched_at
on public.user_searches (user_id, searched_at desc);

create index if not exists idx_user_searches_user_id_query
on public.user_searches (user_id, query);

alter table public.user_searches enable row level security;

drop policy if exists "user_searches_select_own" on public.user_searches;
create policy "user_searches_select_own"
on public.user_searches
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_searches_insert_own" on public.user_searches;
create policy "user_searches_insert_own"
on public.user_searches
for insert
to authenticated
with check (user_id = auth.uid());
