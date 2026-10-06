-- Benefits Finder initial schema. Every table is private to its owner (RLS at the bottom).

create table profile (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  birth_month int not null check (birth_month between 1 and 12),
  email_reminders boolean not null default true,
  last_reminder_year int,
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (btrim(name) <> ''),
  kind text not null check (kind in ('card_issuer', 'club', 'store_club')),
  logo_url text,
  benefits_url text,
  last_refreshed_at timestamptz,
  last_refresh_status text not null default 'never' check (last_refresh_status in ('ok', 'failed', 'never')),
  created_at timestamptz not null default now()
);

create table wallet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('card', 'membership')),
  last4 text check (last4 ~ '^[0-9]{4}$'), -- never a full card number
  nickname text,
  color text,
  program_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name_he text not null check (btrim(name_he) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  aliases text[] not null default '{}',
  category text not null check (category in ('food', 'fuel', 'fashion', 'electronics', 'home', 'pharmacy_beauty',
    'restaurants', 'entertainment', 'travel', 'online', 'other')),
  channel text not null default 'both' check (channel in ('in_store', 'online', 'both')),
  created_at timestamptz not null default now()
);

create table benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  program_id uuid not null references programs on delete cascade,
  store_id uuid references stores on delete cascade,
  category text check (category in ('food', 'fuel', 'fashion', 'electronics', 'home', 'pharmacy_beauty',
    'restaurants', 'entertainment', 'travel', 'online', 'other')),
  title text not null check (btrim(title) <> ''),
  description text,
  type text not null check (type in ('percent_off', 'fixed_off', 'cashback_percent', 'points', 'bogo', 'gift',
    'installments', 'other')),
  value numeric,
  min_spend numeric,
  max_discount numeric,
  requires text not null check (requires in ('pay_with_card', 'membership', 'coupon_code')),
  coupon_code text,
  channel text not null default 'both' check (channel in ('in_store', 'online', 'both')),
  timing text not null default 'always' check (timing in ('always', 'birthday_month')),
  valid_from date,
  valid_until date,
  conditions text,
  source_url text,
  last_verified_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'not_seen', 'archived')),
  created_at timestamptz not null default now(),
  check (store_id is null or category is null)
);
create index benefits_program_idx on benefits (program_id);
create index benefits_store_idx on benefits (store_id);

create table imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  program_id uuid not null references programs on delete cascade,
  source text not null check (source in ('ai_link', 'ai_text', 'ai_screenshot', 'scraper', 'manual')),
  raw_input jsonb not null,
  is_refresh boolean not null default false,
  extracted jsonb,
  status text not null default 'pending_review' check (status in ('pending_review', 'saved', 'rejected', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

-- Row Level Security: each row is visible and writable only by its owner.
grant select, insert, update, delete on profile, programs, wallet_items, stores, benefits, imports
  to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['profile', 'programs', 'wallet_items', 'stores', 'benefits', 'imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Private bucket for import screenshots; files live under "<user_id>/...".
insert into storage.buckets (id, name, public) values ('imports', 'imports', false);
create policy "own import files" on storage.objects for all to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text);
