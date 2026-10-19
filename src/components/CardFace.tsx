'use client';
import { useState } from 'react';
import type { CardArt } from '@/lib/core/cardArt';

interface Props {
  art: CardArt; // used when there's no picture, or it can't load (offline: the service worker doesn't cache other origins)
  image?: string | null;
  type: 'card' | 'membership';
  small?: boolean; // a swatch in a list row instead of a wallet card
  className?: string;
}

/**
 * A card's face. A credit card shows its own picture edge to edge; a club shows its club card or logo on a white card.
 * Without a picture the card is drawn: brand (or name-based) gradient, with the wordmark and, for credit cards, a chip.
 */
export default function CardFace({ art, image, type, small = false, className = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const shape = `relative overflow-hidden ${small ? 'rounded-md' : 'rounded-2xl'} ${className}`;

  if (image && failed !== image) {
    return (
      <div aria-hidden className={`${shape} ${type === 'card' ? 'bg-panel-2' : 'bg-white'}`}>
        {/* Already small WebP files on a public CDN: next/image would add a remote-host config and gain nothing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailed(image)}
          className={`h-full w-full ${type === 'card' ? 'object-cover' : `object-contain ${small ? 'p-0.5' : 'p-[12%]'}`}`} />
      </div>
    );
  }

  // A black scrim deepens toward the light end of the gradient so white text stays ≥4.5:1 on every colour.
  const background = `linear-gradient(140deg, transparent, rgb(0 0 0 / 0.4)), linear-gradient(140deg, ${art.from}, ${art.to})`;
  if (small) {
    return (
      <span aria-hidden className={`${shape} grid place-items-center px-0.5 text-center text-[6px] font-black leading-none tracking-wider text-white/90`}
        style={{ background }}>
        <span className="line-clamp-2" dir="auto">{art.mark}</span>
      </span>
    );
  }
  return (
    <div aria-hidden className={`${shape} flex flex-col justify-between p-3 text-white`} style={{ background }}>
      {type === 'card'
        ? <span className="h-5 w-7 rounded-[5px] bg-gradient-to-br from-amber-200 to-amber-500 shadow-inner" />
        : <span />}
      <p className="line-clamp-2 text-base font-black leading-tight tracking-wide drop-shadow" dir="auto">{art.mark}</p>
    </div>
  );
}
