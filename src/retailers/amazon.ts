import type { CheckContext, CheckResult, Retailer, Availability } from '../types.js';
import { getBrowser, newStealthContext } from '../lib/browser.js';

/**
 * Adapter Amazon.fr — tier navigateur (Playwright).
 *
 * Le GET HTTP ne renvoie pas le bloc #availability (rendu en JS). On lit donc
 * le DOM headless. Achetable = bouton #add-to-cart-button présent ET prix
 * buybox non-null. ATTENTION : ne lire le prix QUE dans le buybox
 * (#corePriceDisplay_desktop_feature_div), sinon on capte le prix d'un produit
 * "similaire"/sponsorisé du carrousel.
 *
 * Polling continu : Amazon peut déclencher un CAPTCHA selon l'IP/fréquence ->
 * prévoir proxy résidentiel FR ou la PA-API v5 (cf. README).
 */
const ASINS = [
  'B0CY2YW8BT', // principal (réversible 4-en-1)
  'B0D3PP64JS', // réversible pompe à chaleur
  'B0F1531BBX', // réversible WiFi
];

async function checkAsin(
  context: any,
  asin: string,
  timeoutMs: number,
): Promise<{ inStock: boolean; price: number | null; text: string }> {
  const page = await context.newPage();
  try {
    await page.goto(`https://www.amazon.fr/dp/${asin}`, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await page.waitForTimeout(1500);
    // cookies
    await page
      .locator('#sp-cc-accept')
      .click({ timeout: 2000 })
      .catch(() => {});

    const body: string = await page.evaluate(
      () => (globalThis as any).document?.body?.innerText ?? '',
    );
    if (/validateCaptcha|api-services-support|saisissez les caractères/i.test(body)) {
      return { inStock: false, price: null, text: 'captcha' };
    }

    const hasCart = (await page.locator('#add-to-cart-button').count()) > 0;
    const availability =
      (await page
        .locator('#availability')
        .first()
        .innerText()
        .catch(() => '')) || '';
    const priceTxt = await page
      .locator('#corePriceDisplay_desktop_feature_div .a-offscreen')
      .first()
      .innerText()
      .catch(() => '');
    const price = priceTxt
      ? Number(priceTxt.replace(/[^0-9,]/g, '').replace(',', '.')) || null
      : null;

    const inStock = hasCart && price != null;
    return { inStock, price, text: availability.trim() };
  } finally {
    await page.close().catch(() => {});
  }
}

export function amazonRetailer(): Retailer {
  const url = `https://www.amazon.fr/dp/${ASINS[0]}`;
  return {
    id: 'amazon',
    name: 'Amazon.fr',
    url,
    tier: 'browser',
    recon: 'DOM headless (5 ASIN). Polling continu => proxy/PA-API.',
    async check(ctx: CheckContext): Promise<CheckResult> {
      const t0 = Date.now();
      const base = {
        retailerId: 'amazon',
        retailer: 'Amazon.fr',
        url,
        tier: 'browser' as const,
      };
      if (!ctx.browser) {
        return {
          ...base,
          status: 'unknown',
          price: null,
          via: 'skipped',
          note: 'Tier navigateur — relance avec --browser.',
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      }
      const browser = await getBrowser();
      if (!browser) {
        return {
          ...base,
          status: 'blocked',
          price: null,
          via: 'browser',
          note: 'Playwright non installé — npx playwright install chromium.',
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      }
      const context = await newStealthContext(browser);
      try {
        let captcha = false;
        for (const asin of ASINS) {
          const r = await checkAsin(context, asin, ctx.timeoutMs);
          if (r.text === 'captcha') {
            captcha = true;
            continue;
          }
          if (r.inStock) {
            return {
              ...base,
              status: 'in_stock' as Availability,
              price: r.price,
              via: 'dom',
              note: `Achetable (ASIN ${asin})`,
              ms: Date.now() - t0,
              checkedAt: new Date().toISOString(),
            };
          }
        }
        return {
          ...base,
          status: captcha ? 'blocked' : 'out_of_stock',
          price: null,
          via: 'dom',
          note: captcha
            ? 'CAPTCHA Amazon — proxy résidentiel ou PA-API requis.'
            : 'Indisponible sur tous les ASIN.',
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      } finally {
        await context.close().catch(() => {});
      }
    },
  };
}
