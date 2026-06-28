/**
 * Wrapper Playwright optionnel. Playwright est une dépendance facultative :
 * si elle n'est pas installée, on dégrade proprement (status 'blocked' + note).
 */
import type { Availability } from '../types.js';
import { extractJsonLd, findProductOffer } from './jsonld.js';
import { fromText } from './availability.js';

let browserPromise: Promise<unknown> | null = null;

async function getPlaywright(): Promise<unknown | null> {
  try {
    // import dynamique : pas d'échec au chargement si non installé.
    return await import('playwright');
  } catch {
    return null;
  }
}

export async function getBrowser(): Promise<any | null> {
  const pw: any = await getPlaywright();
  if (!pw) return null;
  if (!browserPromise) {
    browserPromise = pw.chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
  }
  return browserPromise;
}

/** Contexte furtif réutilisable (UA réaliste, locale FR, anti-détection). */
export async function newStealthContext(browser: any): Promise<any> {
  const context = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return context;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b: any = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
}

export interface BrowserCheck {
  status: Availability;
  price: number | null;
  via: string;
  note?: string;
}

export interface BrowserOptions {
  url: string;
  timeoutMs: number;
  /** Sélecteurs DOM optionnels pour lire le stock après rendu. */
  dom?: {
    inStock?: string; // présent => en stock
    outOfStock?: string; // présent => rupture
  };
}

/**
 * Rend la page dans un navigateur furtif, puis tente :
 *   1. JSON-LD offers.availability (le plus fiable)
 *   2. sélecteurs DOM fournis
 *   3. heuristique texte
 */
export async function checkWithBrowser(
  opts: BrowserOptions,
): Promise<BrowserCheck> {
  const browser = await getBrowser();
  if (!browser) {
    return {
      status: 'blocked',
      price: null,
      via: 'browser',
      note: 'Playwright non installé — lance `npx playwright install chromium`.',
    };
  }

  const context = await newStealthContext(browser);
  const page = await context.newPage();
  try {
    await page.goto(opts.url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeoutMs,
    });
    await page.waitForTimeout(1500); // laisse le JS injecter le stock

    const html: string = await page.content();

    // 1. JSON-LD
    const offer = findProductOffer(extractJsonLd(html));
    if (offer && offer.status !== 'unknown') {
      return { status: offer.status, price: offer.price, via: 'json-ld' };
    }

    // 2. DOM ciblé
    if (opts.dom?.inStock && (await page.locator(opts.dom.inStock).count())) {
      return { status: 'in_stock', price: offer?.price ?? null, via: 'dom' };
    }
    if (
      opts.dom?.outOfStock &&
      (await page.locator(opts.dom.outOfStock).count())
    ) {
      return { status: 'out_of_stock', price: offer?.price ?? null, via: 'dom' };
    }

    // 3. Texte visible
    const text: string = await page.evaluate(
      () => (globalThis as any).document?.body?.innerText ?? '',
    );
    const status = fromText(text);
    return {
      status,
      price: offer?.price ?? null,
      via: status === 'unknown' ? 'browser-unknown' : 'text',
    };
  } finally {
    await context.close().catch(() => {});
  }
}
