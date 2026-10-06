import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPageText, htmlToText, MIN_TEXT } from './fetchPage';

describe('htmlToText', () => {
  it('drops scripts and styles, keeps text on separate lines, decodes entities', () => {
    const html = '<html><style>.a{}</style><script>alert(1)</script><h1>הטבות</h1><p>10% הנחה &amp; משלוח&nbsp;חינם</p><ul><li>מנגו</li><li>קסטרו</li></ul></html>';
    expect(htmlToText(html)).toBe('הטבות\n10% הנחה & משלוח חינם\nמנגו\nקסטרו');
  });
});

describe('fetchPageText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null when the page has almost no text (JavaScript-rendered sites)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div id="root"></div>')));
    expect(await fetchPageText('https://example.com')).toBeNull();
  });
  it('returns the text of a real page', async () => {
    const body = `<p>${'הטבה '.repeat(MIN_TEXT)}</p>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    expect((await fetchPageText('https://example.com'))?.startsWith('הטבה')).toBe(true);
  });
  it('returns null on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect(await fetchPageText('https://example.com')).toBeNull();
  });
  it('rejects non-web URLs', async () => {
    await expect(fetchPageText('file:///etc/passwd')).rejects.toThrow('bad_url');
  });
});
