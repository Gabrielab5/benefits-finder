-- Web push: one row per subscribed device, plus per-user switches for each alert kind.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "read own" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add own" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "remove own" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.profile
  add column push_dates boolean not null default true,
  add column push_expiring boolean not null default true,
  add column push_new boolean not null default true,
  add column push_new_since timestamptz;
grant insert (push_dates, push_expiring, push_new, push_new_since) on public.profile to authenticated;
grant update (push_dates, push_expiring, push_new, push_new_since) on public.profile to authenticated;
