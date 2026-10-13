-- A photo / screenshot of the gift card (barcode to show at the register). Stored in the private "imports"
-- bucket under "<user_id>/gift-cards/", which its existing owner-only policy already covers.
alter table public.gift_cards add column image_path text;
