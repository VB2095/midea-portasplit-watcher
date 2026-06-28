import type { CheckContext, CheckResult, Retailer, Availability } from '../types.js';

/**
 * Adapter Optimea — distributeur OFFICIEL (optimea.fr, WooCommerce).
 *
 * Lecture du stock via l'API Store WooCommerce (JSON public, HTTP simple) :
 *   GET /wp-json/wc/store/v1/products?slug=<slug>  ->  is_in_stock, prices.price
 *
 * État au 2026-06-28 : tout le site est en MAINTENANCE (HTTP 503) car le stock
 * de clims a été entièrement vendu. Le retour en HTTP 200 = signal de restock.
 * On surveille donc les 2 fiches : neuf + seconde vie (reconditionné ~799€).
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const VARIANTS = [
  { label: 'neuf', slug: 'climatiseur-split-mobile-midea' },
  {
    label: 'seconde vie',
    slug: 'seconde-vie-climatiseur-split-mobile-midea-silencieux-reversible-sans-installation',
  },
];

const PRODUCT_URL = 'https://www.optimea.fr/product/climatiseur-split-mobile-midea/';

export interface VariantState {
  label: string;
  inStock: boolean;
  price: number | null;
  maintenance: boolean;
}

export const OPTIMEA_URL = PRODUCT_URL;

/** Vérifie les 2 variantes (neuf + seconde vie) via l'API Store WooCommerce. */
export async function checkOptimeaVariants(
  timeoutMs = 25_000,
): Promise<VariantState[]> {
  return Promise.all(VARIANTS.map((v) => checkVariant(v.slug, v.label, timeoutMs)));
}

async function checkVariant(
  slug: string,
  label: string,
  timeoutMs: number,
): Promise<VariantState> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://www.optimea.fr/wp-json/wc/store/v1/products?slug=${slug}`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ctrl.signal,
      },
    );
    const ct = res.headers.get('content-type') ?? '';
    // 503 ou réponse non-JSON => boutique en maintenance (stock épuisé).
    if (res.status === 503 || !ct.includes('json')) {
      return { label, inStock: false, price: null, maintenance: true };
    }
    const arr = (await res.json()) as any[];
    const p = Array.isArray(arr) ? arr[0] : null;
    if (!p) return { label, inStock: false, price: null, maintenance: false };
    const minor = p.prices?.currency_minor_unit ?? 2;
    const raw = p.prices?.price;
    const price =
      raw != null && Number.isFinite(Number(raw))
        ? Number(raw) / 10 ** minor
        : null;
    return {
      label,
      inStock: Boolean(p.is_in_stock && p.is_purchasable),
      price,
      maintenance: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function optimeaRetailer(): Retailer {
  return {
    id: 'optimea',
    name: 'Optimea (officiel)',
    url: PRODUCT_URL,
    tier: 'http',
    recon: 'WooCommerce Store API. Site en maintenance (503) = stock épuisé.',
    async check(ctx: CheckContext): Promise<CheckResult> {
      const t0 = Date.now();
      const base = {
        retailerId: 'optimea',
        retailer: 'Optimea (officiel)',
        url: PRODUCT_URL,
        tier: 'http' as const,
      };
      try {
        const states = await checkOptimeaVariants(ctx.timeoutMs);
        const buyable = states.filter((s) => s.inStock);
        const price = states.find((s) => s.price != null)?.price ?? null;

        let status: Availability;
        let note: string;
        if (buyable.length > 0) {
          status = 'in_stock';
          note = `Dispo : ${buyable.map((s) => `${s.label}${s.price ? ` ${s.price}€` : ''}`).join(', ')}`;
        } else if (states.every((s) => s.maintenance)) {
          status = 'out_of_stock';
          note = 'Site en maintenance (stock épuisé). Restock = retour en HTTP 200.';
        } else {
          status = 'out_of_stock';
          note = 'Rupture (neuf + seconde vie).';
        }
        return {
          ...base,
          status,
          price,
          via: states.every((s) => s.maintenance) ? 'maintenance-503' : 'wc-store-api',
          note,
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return {
          ...base,
          status: 'error',
          price: null,
          via: 'wc-store-api',
          note: err instanceof Error ? err.message : String(err),
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      }
    },
  };
}
