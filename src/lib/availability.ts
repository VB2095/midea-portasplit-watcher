import type { Availability } from '../types.js';

/** Normalise une valeur schema.org availability vers notre enum. */
export function fromSchemaOrg(value: string): Availability {
  const s = value.toLowerCase().replace(/^https?:\/\/schema\.org\//, '');
  if (/instock|onlineonly|instoreonly/.test(s)) return 'in_stock';
  if (/limitedavailability/.test(s)) return 'limited';
  if (/preorder|presale|backorder/.test(s)) return 'preorder';
  if (/outofstock|soldout|discontinued/.test(s)) return 'out_of_stock';
  return 'unknown';
}

const IN_STOCK_TEXT = [
  'ajouter au panier',
  'ajouter au chariot',
  'en stock',
  'disponible en ligne',
  'livraison à domicile',
  'expédié sous',
  'commander',
];

const OUT_OF_STOCK_TEXT = [
  'rupture',
  'indisponible',
  'épuisé',
  'actuellement indisponible',
  'produit non disponible',
  'plus disponible',
  'me prévenir',
  'alerte dispo',
];

/**
 * Heuristique de secours quand il n'y a pas de donnée structurée :
 * on inspecte le texte visible. Moins fiable que le JSON-LD.
 */
export function fromText(text: string): Availability {
  const t = text.toLowerCase();
  // La rupture prime : "me prévenir / indisponible" est plus discriminant
  // que la simple présence du mot "panier" dans la page.
  const out = OUT_OF_STOCK_TEXT.some((k) => t.includes(k));
  const inStock = IN_STOCK_TEXT.some((k) => t.includes(k));
  if (out && !inStock) return 'out_of_stock';
  if (inStock && !out) return 'in_stock';
  if (inStock && out) return 'unknown'; // signaux contradictoires
  return 'unknown';
}

/** Vrai si le statut signifie "on peut l'acheter maintenant". */
export function isBuyable(status: Availability): boolean {
  return status === 'in_stock' || status === 'limited';
}
