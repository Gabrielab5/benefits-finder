// Sets the picture of catalog cards and clubs: converts each file to a small WebP (SVG logos too), uploads it to the
// public "catalog" bucket and points card_products.image_url at it. Run supabase/migrations/20261019000000_card_images.sql first.
// Usage: node scripts/set-card-images.mjs <images.json>   — file: [{ "product": "<card_products.name>", "file": "<path>" }]
// sharp comes with Next.js (its image optimizer), so it needs no install of its own.
import crypto from 'node:crypto';
import fs from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { data: products, error } = await sb.from('card_products').select('id,name').is('user_id', null);
if (error) throw error;

for (const { product, file } of list) {
  const ids = products.filter((p) => p.name === product).map((p) => p.id);
  if (!ids.length) { console.log(`${product}: no such product`); continue; }
  let webp;
  try {
    webp = await sharp(fs.readFileSync(file), { density: 300 })
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch (e) { console.log(`${product}: not an image (${e.message})`); continue; }
  // Content-hashed name: a replaced picture gets a new URL, so the long browser cache never shows the old one.
  const path = `cards/${ids[0]}-${crypto.createHash('sha1').update(webp).digest('hex').slice(0, 8)}.webp`;
  const { error: e1 } = await sb.storage.from('catalog').upload(path, webp, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
  if (e1) { console.log(`${product}: upload FAILED ${e1.message}`); continue; }
  const url = sb.storage.from('catalog').getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await sb.from('card_products').update({ image_url: url }).in('id', ids);
  console.log(`${product}: ${e2 ? `FAILED ${e2.message}` : `${Math.round(webp.length / 1024)} KB`}`);
}
