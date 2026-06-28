import type { CheckContext, CheckResult, Retailer } from '../types.js';
import { fetchHtml } from '../lib/http.js';
import { extractJsonLd, findProductOffer } from '../lib/jsonld.js';
import { fromText } from '../lib/availability.js';
import { checkWithBrowser } from '../lib/browser.js';

function now(): string {
  return new Date().toISOString();
}

export interface HttpRetailerSpec {
  id: string;
  name: string;
  url: string;
  recon?: string;
  /**
   * Confirmation du "in_stock" annoncé par le JSON-LD.
   * Beaucoup d'enseignes déclarent `InStock` dès que le produit est *référencé*,
   * indépendamment du stock réel (livraison/magasin chargés via API).
   * Retourne true = stock réel confirmé, false = en fait rupture,
   * null = impossible à confirmer en HTML statique (=> statut 'unknown').
   * Si non fourni, on NE fait PAS confiance au in_stock JSON-LD (=> 'unknown').
   */
  confirmInStock?: (html: string) => boolean | null;
}

/**
 * Enseigne lisible en HTTP brut via JSON-LD (Boulanger, Castorama...).
 * Fallback texte si pas de JSON-LD exploitable.
 */
export function httpJsonLd(spec: HttpRetailerSpec): Retailer {
  return {
    ...spec,
    tier: 'http',
    async check(ctx: CheckContext): Promise<CheckResult> {
      const t0 = Date.now();
      const base = {
        retailerId: spec.id,
        retailer: spec.name,
        url: spec.url,
        tier: 'http' as const,
      };
      try {
        const res = await fetchHtml(spec.url, ctx.timeoutMs);
        if (res.blocked) {
          return {
            ...base,
            status: 'blocked',
            price: null,
            via: `http-${res.status}`,
            note: 'Anti-bot détecté — bascule en mode --browser.',
            ms: Date.now() - t0,
            checkedAt: now(),
          };
        }
        if (res.status === 404) {
          return {
            ...base,
            status: 'not_found',
            price: null,
            via: 'http-404',
            ms: Date.now() - t0,
            checkedAt: now(),
          };
        }
        const offer = findProductOffer(extractJsonLd(res.html));
        if (offer && offer.status !== 'unknown') {
          // Le JSON-LD `InStock` est trompeur : il dit souvent juste "produit
          // référencé". On exige une confirmation pour un statut achetable.
          if (offer.status === 'in_stock' || offer.status === 'limited') {
            const confirmed = spec.confirmInStock?.(res.html) ?? null;
            if (confirmed === false) {
              return {
                ...base,
                status: 'out_of_stock',
                price: offer.price,
                via: 'json-ld+dom',
                ms: Date.now() - t0,
                checkedAt: now(),
              };
            }
            if (confirmed === null) {
              return {
                ...base,
                status: 'unknown',
                price: offer.price,
                via: 'json-ld-listed',
                note: 'JSON-LD "InStock" = produit référencé, PAS stock réel. Stock livraison/magasin à confirmer via API dédiée.',
                ms: Date.now() - t0,
                checkedAt: now(),
              };
            }
          }
          return {
            ...base,
            status: offer.status,
            price: offer.price,
            via: 'json-ld',
            ms: Date.now() - t0,
            checkedAt: now(),
          };
        }
        const status = fromText(res.html);
        return {
          ...base,
          status,
          price: offer?.price ?? null,
          via: status === 'unknown' ? 'http-unknown' : 'text',
          note:
            status === 'unknown'
              ? 'Page reçue mais statut illisible (structure changée ?).'
              : undefined,
          ms: Date.now() - t0,
          checkedAt: now(),
        };
      } catch (err) {
        return {
          ...base,
          status: 'error',
          price: null,
          via: 'http',
          note: err instanceof Error ? err.message : String(err),
          ms: Date.now() - t0,
          checkedAt: now(),
        };
      }
    },
  };
}

export interface BrowserRetailerSpec extends HttpRetailerSpec {
  dom?: { inStock?: string; outOfStock?: string };
}

/** Enseigne nécessitant un navigateur headless (anti-bot ou JS-rendu). */
export function browserRetailer(spec: BrowserRetailerSpec): Retailer {
  return {
    id: spec.id,
    name: spec.name,
    url: spec.url,
    recon: spec.recon,
    tier: 'browser',
    async check(ctx: CheckContext): Promise<CheckResult> {
      const t0 = Date.now();
      const base = {
        retailerId: spec.id,
        retailer: spec.name,
        url: spec.url,
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
          checkedAt: now(),
        };
      }
      try {
        const r = await checkWithBrowser({
          url: spec.url,
          timeoutMs: ctx.timeoutMs,
          dom: spec.dom,
        });
        return {
          ...base,
          status: r.status,
          price: r.price,
          via: r.via,
          note: r.note,
          ms: Date.now() - t0,
          checkedAt: now(),
        };
      } catch (err) {
        return {
          ...base,
          status: 'error',
          price: null,
          via: 'browser',
          note: err instanceof Error ? err.message : String(err),
          ms: Date.now() - t0,
          checkedAt: now(),
        };
      }
    },
  };
}
