-- Shared catalog: programs, stores, benefits and card products with user_id NULL are shared with everyone;
-- rows with a user_id are private to that user. Only admins write shared rows. Run once in the SQL editor.
begin;

create table card_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete cascade, -- null = shared
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('card', 'membership')),
  program_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table programs alter column user_id drop not null;
alter table stores alter column user_id drop not null;
alter table benefits alter column user_id drop not null;

alter table profile
  add column is_admin boolean not null default false,
  add column anniversary_month int check (anniversary_month between 1 and 12),
  add column anniversary_day int check (anniversary_day between 1 and 31),
  add column children jsonb not null default '[]'::jsonb,
  add column reminded text[] not null default '{}';

alter table wallet_items
  add column product_id uuid references card_products on delete set null,
  add column birthday_month int check (birthday_month between 1 and 12);

alter table imports add column shared boolean not null default false;

alter table benefits drop constraint benefits_timing_check;
alter table benefits add constraint benefits_timing_check
  check (timing in ('always', 'birthday_month', 'anniversary_month', 'child_birthday_month'));

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce((select p.is_admin from public.profile p where p.user_id = auth.uid()), false) $$;

grant select, insert, update, delete on card_products to authenticated, service_role;
alter table card_products enable row level security;

do $$
declare t text;
begin
  foreach t in array array['programs', 'stores', 'benefits'] loop
    execute format('drop policy "own rows" on public.%I', t);
  end loop;
  foreach t in array array['programs', 'stores', 'benefits', 'card_products'] loop
    execute format('create policy "read shared and own" on public.%I for select to authenticated
      using (user_id is null or user_id = (select auth.uid()))', t);
    execute format('create policy "insert own, or shared as admin" on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))', t);
    execute format('create policy "update own, or shared as admin" on public.%I for update to authenticated
      using (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))
      with check (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))', t);
    execute format('create policy "delete own, or shared as admin" on public.%I for delete to authenticated
      using (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))', t);
  end loop;
end $$;

-- Nobody can make themselves admin: profile writes are limited to these columns (admin changes use the secret key).
revoke insert, update on profile from authenticated;
grant insert (user_id, birth_month, email_reminders, anniversary_month, anniversary_day, children) on profile to authenticated;
grant update (user_id, birth_month, email_reminders, anniversary_month, anniversary_day, children, reminded) on profile to authenticated;

commit;
