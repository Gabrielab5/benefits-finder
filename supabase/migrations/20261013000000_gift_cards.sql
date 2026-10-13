-- Gift cards the user owns (BuyMe, Tav Hazahav, store cards…). Private to the owner.
create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (btrim(name) <> ''),
  amount numeric not null check (amount > 0),          -- value when received
  balance numeric not null check (balance >= 0),       -- what is left after partial use
  received_on date,
  expires_on date,
  code text,                                           -- voucher / card code
  link text,                                           -- e.g. the BuyMe voucher link
  any_store boolean not null default false,            -- works anywhere (e.g. a prepaid credit gift card)
  store_ids uuid[] not null default '{}',              -- catalog stores that accept it
  stores_url text,                                     -- page listing the stores that accept it
  notes text,
  created_at timestamptz not null default now()
);
alter table public.gift_cards enable row level security;
create policy "own rows" on public.gift_cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.gift_cards to authenticated, service_role;
