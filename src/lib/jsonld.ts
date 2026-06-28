import type { Availability } from '../types.js';
import { fromSchemaOrg } from './availability.js';

/** Extrait tous les blocs <script type="application/ld+json"> d'un HTML. */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Certains sites concatènent ou échappent mal : on ignore le bloc cassé.
    }
  }
  return out;
}

/** Aplatit @graph / tableaux pour itérer sur tous les noeuds. */
function flatten(node: unknown, acc: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const n of node) flatten(n, acc);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    acc.push(obj);
    if (Array.isArray(obj['@graph'])) flatten(obj['@graph'], acc);
  }
}

function typeIncludes(node: Record<string, unknown>, t: string): boolean {
  const type = node['@type'];
  if (typeof type === 'string') return type.toLowerCase() === t.toLowerCase();
  if (Array.isArray(type))
    return type.some((x) => String(x).toLowerCase() === t.toLowerCase());
  return false;
}

export interface OfferInfo {
  status: Availability;
  price: number | null;
}

/** Lit availability + prix depuis un noeud Offer / AggregateOffer. */
function readOffer(offer: Record<string, unknown>): OfferInfo {
  let price: number | null = null;
  const p = offer['price'] ?? offer['lowPrice'] ?? offer['highPrice'];
  if (p != null) {
    const n = Number(String(p).replace(',', '.'));
    if (Number.isFinite(n) && n > 0) price = n; // 0 € = placeholder, on ignore
  }
  const avail = offer['availability'];
  const status: Availability =
    typeof avail === 'string' ? fromSchemaOrg(avail) : 'unknown';
  return { status, price };
}

/**
 * Cherche le premier Product avec une offre exploitable dans des blocs JSON-LD.
 * Gère offers en objet unique, en tableau, et AggregateOffer.offers.
 */
export function findProductOffer(blocks: unknown[]): OfferInfo | null {
  const nodes: Record<string, unknown>[] = [];
  for (const b of blocks) flatten(b, nodes);

  const offers: Record<string, unknown>[] = [];
  for (const node of nodes) {
    if (!typeIncludes(node, 'Product')) continue;
    const raw = node['offers'];
    const candidates = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const offer = c as Record<string, unknown>;
      if (Array.isArray(offer['offers'])) {
        for (const sub of offer['offers'])
          if (sub && typeof sub === 'object')
            offers.push(sub as Record<string, unknown>);
      } else {
        offers.push(offer);
      }
    }
  }

  if (offers.length === 0) return null;

  const parsed = offers.map(readOffer);
  // Si une offre quelconque est achetable, le produit est dispo.
  const buyable = parsed.find(
    (o) => o.status === 'in_stock' || o.status === 'limited',
  );
  if (buyable) return buyable;
  // Sinon, on prend la première offre connue (rupture/preorder), avec un prix.
  const known = parsed.find((o) => o.status !== 'unknown');
  const withPrice = parsed.find((o) => o.price != null);
  const base = known ?? parsed[0]!;
  return { status: base.status, price: base.price ?? withPrice?.price ?? null };
}
