import type { CheckContext, CheckResult, Retailer, Availability } from '../types.js';
import { PRODUCT_URL, getOfferContext, lastStock } from '../boulanger/api.js';

/**
 * Adapter Boulanger — stock RÉEL en HTTP (pas de navigateur).
 *
 * Combine deux signaux 1ʳᵉ-partie :
 *   - dispo online (attribut analytics de la fiche)
 *   - stock magasin autour de ton CP via l'API GraphQL `lastStock`
 * Voir src/boulanger/api.ts. Balayage national : `npm run boulanger:stock`.
 */
export interface BoulangerOptions {
  postalCode: string;
}

export function boulangerRetailer(opts: BoulangerOptions): Retailer {
  return {
    id: 'boulanger',
    name: 'Boulanger',
    url: PRODUCT_URL,
    tier: 'http',
    recon: 'Online (analytics) + stock magasin via GraphQL lastStock.',
    async check(ctx: CheckContext): Promise<CheckResult> {
      const t0 = Date.now();
      const base = {
        retailerId: 'boulanger',
        retailer: 'Boulanger',
        url: PRODUCT_URL,
        tier: 'http' as const,
      };
      try {
        const offer = await getOfferContext(ctx.timeoutMs);
        const stores = await lastStock(
          offer,
          { postalCode: opts.postalCode, addressCountry: 'FRA' },
          ctx.timeoutMs,
        );
        const local = stores.filter((s) => s.quantity > 0);

        const channels: string[] = [];
        if (offer.online === 'in_stock') channels.push('livraison');
        if (local.length) {
          const nearest = local[0]!;
          channels.push(`${local.length} mag. (ex: ${nearest.city} q${nearest.quantity})`);
        }
        const status: Availability = channels.length ? 'in_stock' : 'out_of_stock';
        return {
          ...base,
          status,
          price: 999,
          via: 'analytics+laststock',
          note: channels.length
            ? `Dispo : ${channels.join(', ')}`
            : `Rupture online + magasins (autour de ${opts.postalCode}). Sweep : npm run boulanger:stock`,
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return {
          ...base,
          status: 'error',
          price: null,
          via: 'boulanger',
          note: err instanceof Error ? err.message : String(err),
          ms: Date.now() - t0,
          checkedAt: new Date().toISOString(),
        };
      }
    },
  };
}
