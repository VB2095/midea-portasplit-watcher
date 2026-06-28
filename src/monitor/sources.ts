/**
 * Collecteurs d'offres ACHETABLES par source fiable (HTTP, sans navigateur).
 * Chaque scanner renvoie la liste des offres en stock *maintenant*, avec une
 * clé stable (`key`) par offre (canal/magasin) pour détecter les transitions.
 */
import {
  fetchAllStores,
  fulfilment,
  buyable as castoBuyable,
  PRODUCT_URL as CASTO_URL,
} from '../casto/api.js';
import {
  getOfferContext,
  lastStock,
  FRANCE_GRID,
  PRODUCT_URL as BOULANGER_URL,
} from '../boulanger/api.js';
import { checkOptimeaVariants, OPTIMEA_URL } from '../retailers/optimea.js';
import { pool, withRetry } from '../lib/util.js';

export interface Offer {
  source: string; // 'castorama' | 'boulanger' | 'optimea'
  key: string; // identifiant stable de l'offre (dédup + transition)
  label: string; // texte lisible pour l'alerte
  url: string;
  price: number | null;
}

export interface ScanResult {
  source: string;
  offers: Offer[];
  ok: boolean;
  note?: string;
}

/** Castorama : 93 magasins + livraison. */
export async function scanCastorama(): Promise<ScanResult> {
  try {
    const stores = await withRetry(() => fetchAllStores());
    const rows = await pool(stores, 8, (s) =>
      withRetry(() => fulfilment(s.id, s.postalCode))
        .then((f) => ({ s, f }))
        .catch(() => ({ s, f: null as any })),
    );
    const offers: Offer[] = [];
    let deliveryDone = false;
    for (const { s, f } of rows) {
      if (!f) continue;
      if (!deliveryDone && castoBuyable(f.homeDelivery)) {
        deliveryDone = true;
        offers.push({
          source: 'castorama',
          key: 'castorama:delivery',
          label: 'Castorama — livraison à domicile',
          url: CASTO_URL,
          price: 999.9,
        });
      }
      if (castoBuyable(f.inStore) || castoBuyable(f.clickAndCollect)) {
        offers.push({
          source: 'castorama',
          key: `castorama:store:${s.id}`,
          label: `Castorama ${s.city} (${s.postalCode}) — retrait/magasin`,
          url: CASTO_URL,
          price: 999.9,
        });
      }
    }
    return { source: 'castorama', offers, ok: true };
  } catch (err) {
    return {
      source: 'castorama',
      offers: [],
      ok: false,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Boulanger : magasins (lastStock sur maillage France) + livraison online. */
export async function scanBoulanger(): Promise<ScanResult> {
  try {
    const offer = await withRetry(() => getOfferContext());
    const offers: Offer[] = [];
    if (offer.online === 'in_stock') {
      offers.push({
        source: 'boulanger',
        key: 'boulanger:online',
        label: 'Boulanger — livraison à domicile',
        url: BOULANGER_URL,
        price: 999,
      });
    }
    const lists = await pool(FRANCE_GRID, 6, (pt) =>
      withRetry(() =>
        lastStock(offer, { location: { latitude: pt.lat, longitude: pt.lng } }),
      ).catch(() => []),
    );
    const seen = new Set<string>();
    for (const list of lists)
      for (const s of list) {
        if (s.quantity > 0 && !seen.has(s.siteId)) {
          seen.add(s.siteId);
          offers.push({
            source: 'boulanger',
            key: `boulanger:store:${s.siteId}`,
            label: `Boulanger ${s.city} (${s.postalCode}) — ${s.quantity} en stock`,
            url: BOULANGER_URL,
            price: 999,
          });
        }
      }
    return { source: 'boulanger', offers, ok: true };
  } catch (err) {
    return {
      source: 'boulanger',
      offers: [],
      ok: false,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Optimea (officiel) : neuf + seconde vie via API Store WooCommerce. */
export async function scanOptimea(): Promise<ScanResult> {
  try {
    const states = await checkOptimeaVariants();
    const offers: Offer[] = states
      .filter((s) => s.inStock)
      .map((s) => ({
        source: 'optimea',
        key: `optimea:${s.label}`,
        label: `Optimea (officiel) — ${s.label}${s.price ? ` ${s.price}€` : ''}`,
        url: OPTIMEA_URL,
        price: s.price,
      }));
    const allMaintenance = states.every((s) => s.maintenance);
    return {
      source: 'optimea',
      offers,
      ok: true,
      note: allMaintenance ? 'maintenance (503)' : undefined,
    };
  } catch (err) {
    return {
      source: 'optimea',
      offers: [],
      ok: false,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export const ALL_SCANNERS = [scanCastorama, scanBoulanger, scanOptimea];
