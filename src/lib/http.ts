/** En-têtes imitant un vrai navigateur Chrome (réduit les blocages basiques). */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

export interface FetchHtmlResult {
  ok: boolean;
  status: number;
  html: string;
  /** true si la réponse ressemble à une page anti-bot. */
  blocked: boolean;
}

const BLOCK_SIGNATURES = [
  'datadome',
  'captcha-delivery',
  'just a moment',
  'cf-challenge',
  'challenge-platform',
  'enable javascript and disable any ad blocker',
  'queue-it',
  'queue.fnacdarty',
  'px-captcha',
];

export async function fetchHtml(
  url: string,
  timeoutMs: number,
): Promise<FetchHtmlResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const html = await res.text();
    const lower = html.slice(0, 4000).toLowerCase();
    const blocked =
      res.status === 403 ||
      res.status === 429 ||
      BLOCK_SIGNATURES.some((s) => lower.includes(s));
    return { ok: res.ok, status: res.status, html, blocked };
  } finally {
    clearTimeout(timer);
  }
}
