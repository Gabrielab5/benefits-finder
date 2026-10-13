'use client';
import { useEffect, useRef, useState } from 'react';

const GAME_AFTER_MS = 2500; // quick waits only show the coin; longer ones get the game
const BEST_KEY = 'coin-catch-best';

interface Coin {
  id: number;
  left: number; // %
  value: 1 | 5 | 10;
  speed: number; // seconds to fall
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Catch the falling shekels while something loads. Tap a coin to bank it; misses cost nothing. */
function CoinCatch() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [pops, setPops] = useState<{ id: number; left: number; value: number }[]>([]);
  const next = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      const roll = Math.random();
      const value = roll > 0.92 ? 10 : roll > 0.7 ? 5 : 1;
      setCoins((c) => [...c.slice(-12), {
        id: next.current++, left: 6 + Math.random() * 80, value,
        speed: value === 10 ? 1.6 : value === 5 ? 2.1 : 2.6, // bigger coins fall faster
      }]);
    }, 650);
    return () => clearInterval(t);
  }, []);

  function grab(coin: Coin) {
    setCoins((c) => c.filter((x) => x.id !== coin.id));
    setPops((p) => [...p.slice(-5), { id: coin.id, left: coin.left, value: coin.value }]);
    const n = score + coin.value;
    setScore(n);
    if (n > best) {
      setBest(n);
      try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* private mode: no record kept */ }
    }
  }

  return (
    <div className="pop-in w-full max-w-xs space-y-2">
      <div className="flex justify-between text-xs text-muted">
        <span>תפסתם <span className="font-bold text-mint">₪{score}</span></span>
        <span>שיא: ₪{best}</span>
      </div>
      <div aria-label="משחק תפיסת מטבעות בזמן ההמתנה"
        className="relative h-56 overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-panel to-ink">
        {coins.map((c) => (
          <button key={c.id} type="button" tabIndex={-1} aria-hidden onPointerDown={() => grab(c)}
            onAnimationEnd={() => setCoins((all) => all.filter((x) => x.id !== c.id))}
            className={`coin-fall absolute top-0 grid -translate-x-1/2 place-items-center rounded-full font-black shadow-lg ${
              c.value === 10 ? 'h-9 w-9 bg-party text-white' : c.value === 5 ? 'h-10 w-10 bg-sky text-ink' : 'h-11 w-11 bg-warn text-ink'
            }`}
            style={{ left: `${c.left}%`, animationDuration: `${c.speed}s` }}>
            {c.value === 1 ? '₪' : c.value}
          </button>
        ))}
        {pops.map((p) => (
          <span key={p.id} aria-hidden className="score-pop pointer-events-none absolute top-1/2 -translate-x-1/2 font-bold text-mint"
            style={{ left: `${p.left}%` }}>+{p.value}</span>
        ))}
        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-dim">הקישו על המטבעות 🪙</p>
      </div>
    </div>
  );
}

/**
 * Shown the moment something starts: a spinning coin and what is happening. If it takes a while, a mini game.
 * `overlay` covers the screen (actions that navigate or must finish); otherwise it sits inline (page loading).
 */
export default function Waiting({ label, overlay = false }: { label: string; overlay?: boolean }) {
  const [game, setGame] = useState(false);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // no falling coins for reduced motion
    const t = setTimeout(() => setGame(true), GAME_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const body = (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-center">
      <span aria-hidden className="coin-spin grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-warn to-mint text-2xl font-black text-ink shadow-lg shadow-mint/30">
        ₪
      </span>
      <p className="flex items-center gap-2 font-semibold text-fg">
        {label}
        <span className="typing inline-flex gap-1 text-mint" aria-hidden><span /><span /><span /></span>
      </p>
      {game && (
        <>
          <p className="fade-up text-sm text-muted">לוקח קצת זמן… בינתיים, תפסו כמה שקלים 👇</p>
          <CoinCatch />
        </>
      )}
    </div>
  );

  return overlay ? (
    <div className="fade-up fixed inset-0 z-50 grid place-items-center bg-ink/85 p-6 backdrop-blur-md">{body}</div>
  ) : (
    <div className="grid min-h-[60dvh] place-items-center p-4">{body}</div>
  );
}
