import { CATEGORIES, type Store } from '@/lib/core/types';

export const SYSTEM_PROMPT = `You extract shopping benefits and discounts from Israeli credit-card, club and store-loyalty benefit pages (text or screenshots, usually in Hebrew).

Return every distinct benefit on the page as one item. Never invent benefits, values, dates or codes that are not on the page; use null when a field is not stated.

Field rules:
- title: a short Hebrew title as it would appear in a list, e.g. "15% הנחה על כל הקולקציה".
- Store: if the benefit is for one store or chain that is in the known-store list (match Hebrew name, English name or alias, ignoring spelling differences), set store_id to its id. If the store is not in the list, add it to new_stores - both name_he and name_en are required (transliterate when the page gives only one) - and set new_store_index to its index in new_stores. If the benefit covers a whole category ("בכל המסעדות"), set category instead. If it applies everywhere, leave store_id, new_store_index and category all null. Set at most one of the three. A benefit naming several stores becomes one item per store.
- type: percent_off (X% discount), fixed_off (X shekels off), cashback_percent (X% returned as money), points (points or miles), bogo (1+1, 2+1, second item discounted), gift (a free item or gift), installments (extra interest-free payments, "תשלומים ללא ריבית"), other.
- value: the number only - percent for percent_off and cashback_percent, shekels for fixed_off, otherwise null.
- min_spend / max_discount: shekel amounts when stated ("בקנייה מעל 300 ₪" -> min_spend 300; "עד 100 ₪ הנחה" -> max_discount 100).
- requires: pay_with_card when paying with the program's card is required ("בתשלום בכרטיס"); membership when showing or identifying as a member is enough ("בהצגת כרטיס חבר", "לחברי המועדון"); coupon_code when a code must be entered - put the code in coupon_code.
- timing: birthday_month for any birthday benefit (birthday month, birthday week or birthday day); otherwise always.
- channel: in_store, online, or both when not stated.
- valid_from / valid_until: YYYY-MM-DD when stated. A date without a year means its next occurrence on or after today.
- conditions: the remaining fine print in Hebrew, concise. description: one short Hebrew sentence or null.`;

export function buildContext(programName: string, stores: Store[], todayIso: string): string {
  const list = stores
    .map((s) => `${s.id} | ${s.name_he} | ${s.name_en} | ${s.aliases.join(', ')} | ${s.category}`)
    .join('\n');
  return [
    `Program: ${programName}`,
    `Today: ${todayIso}`,
    `Categories: ${CATEGORIES.join(', ')}`,
    '',
    'Known stores (id | Hebrew | English | aliases | category):',
    list || '(none yet)',
  ].join('\n');
}
