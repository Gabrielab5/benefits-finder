import type { CSSProperties } from 'react';
import Image from 'next/image';
import { BadgePercent, Banknote, Gift, type LucideIcon } from 'lucide-react';

/**
 * Where a piece sits on the collage: one square composition, scaled to cover its panel and cropped at the edges like a
 * photo, so the same numbers work as a wide phone header and a tall desktop half. All values are % of the square.
 * x, y: the centre, x measured from the start edge (0 is the outer edge, 100 the seam with the form, which fades out).
 * The phone shows roughly x 10–90 and y 14–80, a desktop half x 10–90 and all of y.
 * size: width. rot: degrees. layer: 0 back (dimmed) → 2 front (deepest shadow). phone: false hides it under md.
 */
type Spot = { x: number; y: number; size: number; rot: number; layer: 0 | 1 | 2; phone?: false };
type Tile = Spot &
  (
    | { kind: 'photo' | 'card' | 'logo'; src: string; w: number; h: number; eager?: true }
    | { kind: 'coin' }
    | { kind: 'chip'; icon: LucideIcon; tone: string }
  );

/**
 * To add an image: put it in public/login/, then add a row with its pixel size (w, h) and where it goes.
 * eager: only the few largest pieces a phone shows; everything else loads lazily, and phone: false pieces never load there.
 */
const TILES: Tile[] = [
  // Back: the photos as large prints at the edges, and club logos dimmed into the table.
  { kind: 'photo', src: '/login/photo-fly.webp', w: 738, h: 414, x: 30, y: 17, size: 56, rot: -4, layer: 0, eager: true },
  { kind: 'photo', src: '/login/photo-table.webp', w: 574, h: 334, x: 76, y: 61, size: 48, rot: 5, layer: 0, eager: true },
  { kind: 'photo', src: '/login/photo-hand.webp', w: 381, h: 251, x: 22, y: 80, size: 44, rot: -7, layer: 0, eager: true },
  { kind: 'card', src: '/login/card-hapoalim-classic.webp', w: 324, h: 200, x: 72, y: 95, size: 20, rot: -6, layer: 0, phone: false },
  { kind: 'card', src: '/login/card-leumi-behatzdaa.webp', w: 221, h: 136, x: 91, y: 42, size: 19, rot: -8, layer: 0 },
  { kind: 'card', src: '/login/card-behatzdaa.webp', w: 221, h: 128, x: 88, y: 88, size: 19, rot: 6, layer: 0, phone: false },
  { kind: 'logo', src: '/login/logo-htz.webp', w: 200, h: 120, x: 93, y: 7, size: 10, rot: 9, layer: 0, phone: false },
  { kind: 'logo', src: '/login/logo-uniq.webp', w: 200, h: 120, x: 7, y: 95, size: 11, rot: -6, layer: 0, phone: false },
  { kind: 'logo', src: '/login/logo-ashmoret.webp', w: 200, h: 120, x: 68, y: 27, size: 11, rot: -5, layer: 0 },
  { kind: 'logo', src: '/login/logo-shelcha.webp', w: 200, h: 120, x: 6, y: 57, size: 10, rot: 8, layer: 0 },
  { kind: 'logo', src: '/login/logo-tov.webp', w: 200, h: 120, x: 30, y: 4, size: 11, rot: 5, layer: 0, phone: false },
  { kind: 'logo', src: '/login/logo-adif.webp', w: 200, h: 120, x: 93, y: 66, size: 11, rot: 9, layer: 0 },
  { kind: 'logo', src: '/login/logo-bigtarim.webp', w: 200, h: 120, x: 72, y: 8, size: 11, rot: -8, layer: 0, phone: false },
  { kind: 'logo', src: '/login/logo-nachon.webp', w: 200, h: 120, x: 52, y: 5, size: 10, rot: 6, layer: 0, phone: false },
  { kind: 'logo', src: '/login/logo-pais.webp', w: 200, h: 120, x: 9, y: 70, size: 10, rot: -9, layer: 0 },
  { kind: 'logo', src: '/login/logo-yahad.webp', w: 200, h: 120, x: 94, y: 32, size: 10, rot: 7, layer: 0 },

  // Middle: money badges, then the cards around the fan, overlapping the prints' and the badges' edges.
  { kind: 'chip', icon: BadgePercent, tone: 'text-mint', x: 23, y: 32, size: 8, rot: -12, layer: 1 },
  { kind: 'chip', icon: Banknote, tone: 'text-mint', x: 12, y: 76, size: 8, rot: 10, layer: 1 },
  { kind: 'chip', icon: Gift, tone: 'text-party', x: 76, y: 32, size: 7.5, rot: 12, layer: 1 },
  { kind: 'card', src: '/login/card-amex-green.webp', w: 312, h: 205, x: 9, y: 30, size: 22, rot: 12, layer: 1 },
  { kind: 'card', src: '/login/card-hapoalim-gold.webp', w: 324, h: 200, x: 87, y: 23, size: 22, rot: -10, layer: 1 },
  { kind: 'card', src: '/login/card-cal-shaveh.webp', w: 357, h: 560, x: 64, y: 81, size: 13, rot: 10, layer: 1 },
  { kind: 'card', src: '/login/card-superfly.webp', w: 476, h: 346, x: 55, y: 40, size: 32, rot: 14, layer: 1 },
  { kind: 'card', src: '/login/card-amex-gold.webp', w: 316, h: 208, x: 30, y: 46, size: 30, rot: -14, layer: 1 },
  { kind: 'logo', src: '/login/logo-behatzdaa.webp', w: 200, h: 120, x: 37, y: 67, size: 11, rot: -6, layer: 1 },
  { kind: 'logo', src: '/login/logo-hot.webp', w: 200, h: 120, x: 50, y: 75, size: 10, rot: 7, layer: 1 },
  { kind: 'coin', x: 84, y: 54, size: 5, rot: 0, layer: 1 },

  // Front: the hero card of the fan, a few club stickers and the money.
  { kind: 'card', src: '/login/card-hever-keva.webp', w: 548, h: 346, x: 44, y: 53, size: 38, rot: -3, layer: 2, eager: true },
  { kind: 'logo', src: '/login/logo-yeter.webp', w: 200, h: 120, x: 46, y: 26, size: 12, rot: -6, layer: 2 },
  { kind: 'logo', src: '/login/logo-hever.webp', w: 200, h: 120, x: 15, y: 62, size: 12, rot: 7, layer: 2 },
  { kind: 'logo', src: '/login/logo-krenot.webp', w: 200, h: 120, x: 77, y: 41, size: 11, rot: 8, layer: 2 },
  { kind: 'logo', src: '/login/logo-shaveh.webp', w: 200, h: 120, x: 70, y: 70, size: 12, rot: -5, layer: 2 },
  { kind: 'coin', x: 66, y: 52, size: 8, rot: 12, layer: 2 },
  { kind: 'coin', x: 21, y: 35, size: 6.5, rot: -10, layer: 2 },
  { kind: 'coin', x: 32, y: 70, size: 5.5, rot: 6, layer: 2 },
];

/** Depth: the back layer is dimmed, and the shadow deepens toward the front. drop-shadow follows each cut-out's shape. */
const LAYER = [
  'z-0 brightness-[.72] drop-shadow-[0_4px_8px_rgb(0_0_0/0.35)]',
  'z-10 drop-shadow-[0_10px_12px_rgb(0_0_0/0.4)]',
  'z-20 drop-shadow-[0_18px_24px_rgb(0_0_0/0.55)]',
];

function Piece({ t, i }: { t: Tile; i: number }) {
  const style: CSSProperties = {
    insetInlineStart: `${t.x - t.size / 2}%`,
    top: `${t.y}%`,
    width: `${t.size}%`,
    translate: '0 -50%',
    rotate: `${t.rot}deg`,
    animationDelay: `${t.layer * 150 + (i % 6) * 40}ms`, // dealt back to front
  };
  const cls = `collage-in absolute ${LAYER[t.layer]} ${t.phone === false ? 'max-md:hidden' : ''}`;
  if (t.kind === 'coin') {
    return (
      <span style={style} className={`${cls} @container grid aspect-square place-items-center rounded-full bg-gradient-to-br from-warn to-mint text-ink shadow-[inset_0_2px_0_rgb(255_255_255/0.5)]`}>
        <span className="text-[58cqw] font-black leading-none">₪</span>
      </span>
    );
  }
  if (t.kind === 'chip') {
    const Icon = t.icon;
    return (
      <span style={style} className={`${cls} grid aspect-square place-items-center rounded-[28%] border border-white/10 bg-panel/85 backdrop-blur-sm`}>
        <Icon className={`h-1/2 w-1/2 ${t.tone}`} strokeWidth={1.8} />
      </span>
    );
  }
  // The square is 125vw wide on a phone and about 100vh on a desktop half.
  return (
    <Image src={t.src} width={t.w} height={t.h} alt="" loading={t.eager ? 'eager' : 'lazy'} style={style}
      sizes={`(min-width: 768px) ${Math.round(t.size)}vh, ${Math.round(t.size * 1.25)}vw`}
      className={`${cls} h-auto ${t.kind === 'photo' ? 'rounded-xl' : ''}`} />
  );
}

/** Decorative: hidden from assistive tech, the form's header carries the message. */
export default function LoginCollage() {
  return (
    <div aria-hidden className="collage-table relative h-[40svh] overflow-hidden md:sticky md:top-0 md:h-dvh">
      {/* The square: side 125vw on a phone (zoomed in on the middle), max(panel width, panel height) on a desktop. */}
      <div className="absolute isolate inset-[calc(50%_-_62.5vw)] md:inset-[calc(50%_-_max(25vw,50dvh))]">
        {TILES.map((t, i) => <Piece key={i} t={t} i={i} />)}
      </div>
      <div className="collage-grade absolute inset-0" />
      <p className="absolute inset-x-10 bottom-10 text-base font-semibold text-muted max-md:hidden">
        כל הכרטיסים, המועדונים והשוברים שלכם.
        <br />
        תשובה אחת בקופה.
      </p>
    </div>
  );
}
