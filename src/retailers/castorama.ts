import type { CheckContext, CheckResult, Retailer, Availability } from '../types.js';
import {
  PRODUCT_URL,
  nearestStore,
  fulfilment,
  buyable,
} from '../casto/api.js';

/**
 * Adapter Castorama (groupe Kingfisher) avec le VRAI stock.
 *
 * Le JSON-LD de la fiche dit toujours "InStock" (= produit référencé), ce qui
 * est trompeur. La dispo réelle vient du BFF castorama.fr (cf. src/casto/api.ts).
 * Ce check rapide regarde la livraison sur ton CP + ton magasin le plus proche.
 * Pour le balayage de toute la France : `npm run casto:stock`.
 */
export interface CastoramaOptions {
  postalCode: string;
  lat: number;
  lng: number;
}

export function castoramaRetailer(opts: CastoramaOptions): Retailer {
  return {
    id: 'castorama',
    name: 'Castorama',
    url: PRODUCT_URL,
    tier: 'http',
    recon: 'Stock réel via BFF fulfilment-options (sans auth).',
    async check(ctx: CheckContext): Promise<CheckResult> {
      const t0 = Date.now();
      const base = {
        retailerId: 'castorama',
        retailer: 'Castorama',
        url: PRODUCT_URL,
        tier: 'http' as const,
      };
      try {
        const store = await nearestStore(opts.lat, opts.lng, ctx.timeoutMs);
        const f = await fulfilment(
          store?.id ?? '',
          opts.postalCode,
          ctx.timeoutMs,
        );
        const channels: string[] = [];
        if (buyable(f.homeDelivery)) channels.push(`livraison ${opts.postalCode}`);
        if (buyable(f.clickAndCollect)) channels.push('retrait 2h');
        if (buyable(f.inStore)) channels.push(`stock ${store?.name ?? 'magasin'}`);
        const status: Availability = channels.length ? 'in_stock' : 'out_of_stock';
        return {
          ...base,
          status,
          price: 999.9,
          via: 'bff',
          note:
            status === 'in_stock'
              ? `Dispo : ${channels.join(', ')}`
              : `Rupture local (${store?.name ?? 'magasin proche'}). Sweep France : npm run casto:stock`,
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return {
          ...base,
          status: 'error',
          price: null,
          via: 'bff',
          note: err instanceof Error ? err.message : String(err),
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      }
    },
  };
}
