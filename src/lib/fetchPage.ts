export const MIN_TEXT = 500; // less than this = page is rendered by JavaScript; ask for text/screenshot
export const MAX_TEXT = 300_000;

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/g, (e) => ENTITIES[e])
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function fetchPageText(url: string): Promise<string | null> {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad_url');
  const res = await fetch(u, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; BenefitsFinder/1.0)', 'accept-language': 'he-IL,he;q=0.9' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) return null;
  const text = htmlToText(await res.text());
  return text.length < MIN_TEXT ? null : text;
}
