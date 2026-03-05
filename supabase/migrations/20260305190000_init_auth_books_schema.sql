create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  amoled_dark boolean not null default true,
  wifi_only_downloads boolean not null default false,
  font_scale numeric(4,2) not null default 1.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id bigint primary key,
  title text not null,
  author text,
  language text,
  summary text,
  cover_url text,
  source text not null default 'gutendex',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_books (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  is_saved boolean not null default true,
  last_chapter_index integer,
  last_chunk_index integer,
  last_chapter_href text,
  progress_percent numeric(5,2),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists idx_user_books_user_id on public.user_books (user_id);
create index if not exists idx_user_books_book_id on public.user_books (book_id);
create index if not exists idx_user_books_last_read_at on public.user_books (last_read_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_books_updated_at on public.books;
create trigger set_books_updated_at
before update on public.books
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_books_updated_at on public.user_books;
create trigger set_user_books_updated_at
before update on public.user_books
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.profiles (id, email)
select id, email
from auth.users
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select id
from public.profiles
on conflict (user_id) do nothing;

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
to authenticated
using (true);

drop policy if exists "books_write_authenticated" on public.books;
create policy "books_write_authenticated"
on public.books
for all
to authenticated
using (true)
with check (true);

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
