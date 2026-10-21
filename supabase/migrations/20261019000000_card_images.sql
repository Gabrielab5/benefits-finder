-- A picture for each card or club in the catalog: the real card for credit cards, the club card or logo for clubs.
-- Files live in the public "catalog" bucket (read by anyone, written only with the secret key by scripts/set-card-images.mjs).
alter table public.card_products add column image_url text;
insert into storage.buckets (id, name, public) values ('catalog', 'catalog', true) on conflict (id) do nothing;
