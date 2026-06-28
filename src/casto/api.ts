/**
 * Client de l'API Castorama / Kingfisher (CAFR) pour le stock RÉEL.
 *
 * Deux sources (découvertes par capture réseau, cf. scripts/capture.mjs) :
 *   1. Liste des magasins (header Atmosphere, pas d'OAuth) — un seul appel
 *      depuis le centre de la France ramène TOUS les magasins :
 *        GET api.kingfisher.com/v1/mobile/stores/CAFR?nearLatLong=LAT,LONG&page[size]=500
 *   2. Dispo réelle par magasin + code postal via le BFF castorama.fr (sans auth) :
 *        GET www.castorama.fr/casto-browse-mfe/api/fulfilment-options
 *            ?compositeOfferId=<EAN>&storeId=<id>&postalCode=<cp>
 */

export const EAN = '8431312260509';
export const PRODUCT_URL =
  'https://www.castorama.fr/climatiseur-portasplit-midea-reversible-3500w/8431312260509_CAFR.prd';

const ATMOS =
  'Atmosphere atmosphere_app_id=kingfisher-o4ITR0sWAyCVQBraQf4Es61jHV3dN4oO9UwJQMrS';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Centre géographique de la France métropolitaine. */
export const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };

export interface Store {
  id: string;
  name: string;
  postalCode: string;
  city: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
}

export interface FulfilLine {
  availability: string;
  quantity: number | null;
}

export interface Fulfilment {
  homeDelivery: FulfilLine;
  clickAndCollect: FulfilLine;
  inStore: FulfilLine;
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const JUNK = /\b(SAV|AppM|Refonte|Entrepot|Entrepôt|Test|Siege|Siège)\b/i;

/** Vrai magasin = CP valide + GPS + nom non-technique. */
function isRealStore(name: string, postalCode: string, lat: number): boolean {
  if (!/^\d{5}$/.test(postalCode)) return false;
  if (!Number.isFinite(lat) || lat === 0) return false;
  if (!name || name.trim().toLowerCase() === 'castorama') return false;
  if (JUNK.test(name)) return false;
  return true;
}

function cityFromLines(lines: unknown): string {
  if (!Array.isArray(lines)) return '';
  const nonEmpty = lines.map((l) => String(l).trim()).filter(Boolean);
  return nonEmpty[nonEmpty.length - 1] ?? '';
}

/** Récupère TOUS les magasins Castorama de France (un seul appel). */
export async function fetchAllStores(timeoutMs = 25_000): Promise<Store[]> {
  const url = `https://api.kingfisher.com/v1/mobile/stores/CAFR?nearLatLong=${FRANCE_CENTER.lat},${FRANCE_CENTER.lng}&page%5Bsize%5D=500`;
  const json = await getJson(url, { Authorization: ATMOS }, timeoutMs);
  const data: any[] = json?.data ?? [];
  const stores: Store[] = [];
  for (const s of data) {
    const st = s?.attributes?.store;
    if (!st) continue;
    const geo = st.geoCoordinates ?? {};
    const postalCode = String(geo.postalCode ?? '');
    const lat = Number(geo.coordinates?.latitude ?? geo.latitude);
    const lng = Number(geo.coordinates?.longitude ?? geo.longitude);
    const name = String(st.name ?? '');
    if (!isRealStore(name, postalCode, lat)) continue;
    stores.push({
      id: String(s.id),
      name,
      postalCode,
      city: cityFromLines(geo.address?.lines),
      address: (geo.address?.lines ?? [])
        .map((l: unknown) => String(l).trim())
        .filter(Boolean)
        .join(', '),
      phone: String(st.contactPoint?.telephone ?? '').trim(),
      lat,
      lng,
    });
  }
  return stores;
}

/** Magasin le plus proche d'un point GPS (utilisé par le watcher). */
export async function nearestStore(
  lat: number,
  lng: number,
  timeoutMs = 25_000,
): Promise<{ id: string; name: string } | null> {
  const url = `https://api.kingfisher.com/v1/mobile/stores/CAFR?nearLatLong=${lat},${lng}&page%5Bsize%5D=1`;
  const json = await getJson(url, { Authorization: ATMOS }, timeoutMs);
  const s = json?.data?.[0];
  if (!s) return null;
  return { id: String(s.id), name: String(s.attributes?.store?.name ?? s.id) };
}

function line(x: any): FulfilLine {
  return {
    availability: String(x?.availability ?? 'Unknown'),
    quantity: x?.quantity ?? null,
  };
}

/** Dispo réelle d'un EAN pour un magasin + code postal donnés. */
export async function fulfilment(
  storeId: string,
  postalCode: string,
  timeoutMs = 25_000,
): Promise<Fulfilment> {
  const url = `https://www.castorama.fr/casto-browse-mfe/api/fulfilment-options?compositeOfferId=${EAN}&storeId=${storeId}&postalCode=${postalCode}`;
  const json = await getJson(url, {}, timeoutMs);
  const a = json?.data?.[0]?.attributes;
  if (!a) throw new Error('fulfilment-options : structure inattendue');
  return {
    homeDelivery: line(a.homeDelivery),
    clickAndCollect: line(a.clickAndCollectStorePick),
    inStore: line(a.inStore),
  };
}

/** Un canal est réellement achetable (dispo + quantité > 0 si connue). */
export function buyable(l: FulfilLine | undefined): boolean {
  if (!l) return false;
  const ok = /^(available|instock|limited|in_stock)/i.test(l.availability);
  return ok && (l.quantity == null || l.quantity > 0);
}

// Utilitaires partagés (re-exportés pour les consommateurs existants).
export { haversineKm, pool, withRetry } from '../lib/util.js';
