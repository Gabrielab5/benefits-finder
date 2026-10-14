import { CATEGORY_LABELS, CHANNEL_LABELS, TIMING_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { eligibleItems } from '@/lib/core/rank';
import type { Snapshot } from '@/lib/core/types';

const MAX_LINES = 1500; // ponytail: hard cap keeps the prompt small; retrieve per question if wallets outgrow it

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The user's usable benefits, one compact line each, for the assistant to reason over. */
export function buildChatContext(snap: Snapshot, todayIso: string): string {
  const programs = new Map(snap.programs.map((p) => [p.id, p.name]));
  const stores = new Map(snap.stores.map((s) => [s.id, s]));
  const lines = snap.benefits
    .filter((b) => eligibleItems(b, snap.wallet).length > 0 && (!b.valid_until || b.valid_until >= todayIso))
    .slice(0, MAX_LINES)
    .map((b) => {
      const store = b.store_id ? stores.get(b.store_id) : null;
      const where = store
        ? `${store.name_he} (${CATEGORY_LABELS[store.category]})`
        : b.category ? `כל קטגוריית ${CATEGORY_LABELS[b.category]}` : 'כל החנויות';
      return [
        programs.get(b.program_id) ?? '?', where, b.title,
        `${TYPE_LABELS[b.type]}${b.value != null ? ` ${b.value}` : ''}`,
        b.min_spend ? `מינימום ₪${b.min_spend}` : '', b.max_discount ? `תקרה ₪${b.max_discount}` : '',
        CHANNEL_LABELS[b.channel], b.timing !== 'always' ? TIMING_LABELS[b.timing] : '',
        b.valid_until ? `עד ${b.valid_until}` : '', b.conditions ?? '',
      ].filter(Boolean).join(' | ');
    });
  const wallet = snap.wallet.map((w) => `${w.nickname || w.name} (${w.type === 'card' ? 'כרטיס' : 'מועדון'})`).join(', ');
  return [
    `היום: ${todayIso}`,
    `הארנק של המשתמש: ${wallet || 'ריק'}`,
    `ההטבות הזמינות למשתמש (תוכנית | איפה | כותרת | סוג וערך | תנאים):`,
    ...lines,
  ].join('\n');
}

export const CHAT_SYSTEM = `את/ה עוזר/ת חיסכון בתוך אפליקציית "איפה אני?" שמראה באיזה כרטיס אשראי או מועדון כדאי להשתמש בכל חנות בישראל.
ענה/י תמיד בעברית, בקצרה ובבהירות (עד כ-150 מילים). טקסט רגיל בלבד, בלי Markdown (בלי כוכביות או #); לרשימות השתמש/י ב-•.
- התבסס/י רק על רשימת ההטבות של המשתמש שמופיעה למטה. אל תמציא/י הטבות.
- כשנשאלים "מה הכי משתלם בחנות X": השווה/י את ההטבות הרלוונטיות (של החנות, של הקטגוריה שלה ושל "כל החנויות") וציין/י מה עדיף ולמה.
- כשנשאלים על חנויות דומות: מצא/י חנויות באותה קטגוריה ודרג/י לפי גובה ההנחה.
- אם אין מידע מתאים, אמר/י זאת והצע/י להוסיף הטבות בעמוד "הוספת הטבות" (בלשונית "עוד").
- אל תבקש/י פרטי כרטיס או מידע אישי.`;

/** Keeps only well-formed turns, the last 12, ending with the user. */
export function cleanHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter((m): m is ChatMessage =>
      !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs.length && msgs[msgs.length - 1].role === 'user' ? msgs : null;
}
