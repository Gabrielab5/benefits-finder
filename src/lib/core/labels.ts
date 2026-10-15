import { normalize } from './normalize';
import { isPerItem, type Savings } from './savings';
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
export const TIMING_LABELS: Record<Timing, string> = {
  always: 'תמיד', birthday_month: 'חודש יום ההולדת', anniversary_month: 'חודש יום הנישואין',
  child_birthday_month: 'חודש יום הולדת של ילד',
};
export const TIMING_ICON: Record<Timing, string> = {
  always: '', birthday_month: '🎂', anniversary_month: '💍', child_birthday_month: '🎈',
};
export const WINDOW_ICON: Record<'birthday' | 'anniversary' | 'child', string> = { birthday: '🎂', anniversary: '💍', child: '🎈' };

const OR_MANUAL = ' אפשר גם להוסיף את ההטבות ידנית (לשונית "ידני").';

export const IMPORT_ERRORS: Record<string, string> = {
  unreadable: 'לא הצלחנו לקרוא את הדף. הדביקו את הטקסט או העלו צילום מסך.' + OR_MANUAL,
  too_long: 'התוכן ארוך מדי. ייבאו חלק מהדף בכל פעם.',
  refused: 'לא ניתן לעבד את התוכן הזה.' + OR_MANUAL,
  invalid_output: 'החילוץ נכשל. נסו שוב, ואם הדף ארוך — ייבאו חלק ממנו בכל פעם.' + OR_MANUAL,
  empty: 'אין תוכן לייבוא. הוסיפו קישור, טקסט או צילום מסך.',
  bad_screenshots: 'בחרו 1–5 צילומי מסך (PNG, JPG או WEBP).',
  program_not_found: 'התוכנית לא נמצאה. רעננו את הדף ובחרו אותה שוב.',
  ai_off: 'הייבוא האוטומטי כבוי. השתמשו ב"בעזרת צ׳אט" (חינם) או "ידני".',
  default: 'הייבוא לא התחיל. בדקו את החיבור לאינטרנט ונסו שוב בעוד רגע.' + OR_MANUAL,
};

/** What to do after a save, delete or load failed. Offline is the usual cause on a phone. */
export function retryHint(online: boolean): string {
  return online ? 'נסו שוב בעוד רגע, ואם זה חוזר, רעננו את הדף.' : 'אין חיבור לאינטרנט. נסו שוב כשתתחברו.';
}

/** Product truths shown on login and the first onboarding screen (PRODUCT.md). */
export const TRUST_LINES = [
  'לא מתחברים לבנק או לחשבון האשראי שלכם, ולא מבקשים מספרי כרטיס או סיסמאות לבנק.',
  'לא קשורים לאף חברת אשראי או מועדון, אז לפני שסומכים על הטבה, בדקו את התנאים במקור.',
];

export function shekel(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

/** 2026-12-31 → 31.12.2026 */
export function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('.');
}

type Headlined = Pick<Benefit, 'type' | 'value'> & Partial<Pick<Benefit, 'title' | 'description' | 'conditions' | 'max_discount'>>;

export function headlineText(b: Headlined): string {
  if (isPerItem(b) && b.value != null) {
    const what = b.type === 'cashback_percent' ? `${b.value}% החזר על פריט אחד` : `${b.value}% על פריט אחד`;
    return b.max_discount ? `${what}, עד ${shekel(b.max_discount)}` : what;
  }
  if (b.type === 'percent_off' && b.value != null) return `${b.value}% הנחה`;
  if (b.type === 'fixed_off' && b.value != null) return `${shekel(b.value)} הנחה`;
  if (b.type === 'cashback_percent' && b.value != null) return `${b.value}% החזר`;
  if (b.type === 'points' && b.value != null) return `${b.value}% צבירה`;
  return TYPE_LABELS[b.type];
}

type Derived = Pick<Benefit, 'type' | 'value' | 'min_spend' | 'max_discount'>;

/** How the ₪ saving was computed for the entered amount: "10% × ₪300, עד ₪50", "₪20 בקנייה מעל ₪100". Null with no saving. */
export function savingsDerivation(b: Derived, amount: number, s: Savings): string | null {
  if (s.spendMore > 0 || s.saved <= 0 || b.value == null) return null;
  if (b.type === 'fixed_off') {
    if (s.saved < b.value) return `${shekel(b.value)} הנחה, עד גובה הקנייה`;
    return b.min_spend ? `${shekel(b.value)} בקנייה מעל ${shekel(b.min_spend)}` : `${shekel(b.value)} הנחה קבועה`;
  }
  const rate = b.type === 'cashback_percent' ? `${b.value}% החזר` : `${b.value}%`;
  return `${rate} × ${shekel(amount)}${b.max_discount ? `, עד ${shekel(b.max_discount)}` : ''}`;
}

/**
 * The card's "how to use it" line: verb, the wallet items, then the program and store when they add something.
 * With no wallet item it names the program the benefit needs ("דורש: X").
 */
export function actionLine(requires: Requires, program: string, itemNames: string[], store?: string | null) {
  const where = store ? [store] : [];
  if (itemNames.length === 0) return { verb: 'דורש:', who: program, more: where };
  const p = normalize(program);
  const named = itemNames.some((n) => normalize(n).includes(p));
  return {
    verb: requires === 'pay_with_card' ? 'שלמו עם' : 'הציגו',
    who: itemNames.join(' / '),
    more: named ? where : [program, ...where],
  };
}
