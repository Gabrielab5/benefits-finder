import type { Benefit, BenefitType, Category, Channel, ProgramKind, Requires, Timing } from './types';

export const TYPE_LABELS: Record<BenefitType, string> = {
  percent_off: 'הנחה באחוזים', fixed_off: 'הנחה בשקלים', cashback_percent: 'החזר כספי', points: 'נקודות',
  bogo: '1+1 / מבצע', gift: 'מתנה', installments: 'תשלומים', other: 'אחר',
};
export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'מזון', fuel: 'דלק', fashion: 'אופנה', electronics: 'אלקטרוניקה', home: 'בית',
  pharmacy_beauty: 'פארם ויופי', restaurants: 'מסעדות', entertainment: 'בילוי ופנאי', travel: 'תיירות',
  online: 'אונליין', other: 'אחר',
};
export const KIND_LABELS: Record<ProgramKind, string> = {
  card_issuer: 'חברות אשראי', club: 'מועדונים', store_club: 'מועדוני לקוחות של חנויות',
};
export const REQUIRES_LABELS: Record<Requires, string> = {
  pay_with_card: 'תשלום בכרטיס', membership: 'הצגת חברות', coupon_code: 'קוד קופון',
};
export const CHANNEL_LABELS: Record<Channel, string> = { in_store: 'בחנות', online: 'אונליין', both: 'בחנות ואונליין' };
export const TIMING_LABELS: Record<Timing, string> = { always: 'תמיד', birthday_month: 'חודש יום ההולדת' };

const OR_MANUAL = ' אפשר גם להוסיף את ההטבות ידנית (לשונית "ידני").';

export const IMPORT_ERRORS: Record<string, string> = {
  unreadable: 'לא הצלחנו לקרוא את הדף. הדביקו את הטקסט או העלו צילום מסך.' + OR_MANUAL,
  too_long: 'התוכן ארוך מדי. ייבאו חלק מהדף בכל פעם.',
  refused: 'לא ניתן לעבד את התוכן הזה.' + OR_MANUAL,
  invalid_output: 'החילוץ נכשל. נסו שוב, ואם הדף ארוך — ייבאו חלק ממנו בכל פעם.' + OR_MANUAL,
  empty: 'אין תוכן לייבוא.',
  bad_screenshots: 'בחרו 1–5 צילומי מסך (PNG, JPG או WEBP).',
  program_not_found: 'התוכנית לא נמצאה.',
  ai_off: 'הייבוא האוטומטי כבוי. השתמשו ב"בעזרת צ׳אט" (חינם) או "ידני".',
  default: 'הייבוא נכשל. נסו שוב.' + OR_MANUAL,
};

export function shekel(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

/** 2026-12-31 → 31.12.2026 */
export function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('.');
}

export function headlineText(b: Pick<Benefit, 'type' | 'value'>): string {
  if (b.type === 'percent_off' && b.value != null) return `${b.value}% הנחה`;
  if (b.type === 'fixed_off' && b.value != null) return `${shekel(b.value)} הנחה`;
  if (b.type === 'cashback_percent' && b.value != null) return `${b.value}% החזר`;
  return TYPE_LABELS[b.type];
}
