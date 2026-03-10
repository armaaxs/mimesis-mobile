alter table public.user_settings
add column if not exists display_name text,
add column if not exists birthdate date,
add column if not exists favorite_category_ids text[] not null default '{}'::text[],
add column if not exists onboarding_completed_at timestamptz;

update public.user_settings
set favorite_category_ids = coalesce(favorite_category_ids, '{}'::text[])
where favorite_category_ids is null;
