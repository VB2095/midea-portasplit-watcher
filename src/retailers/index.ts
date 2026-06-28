import type { Retailer } from '../types.js';
import { browserRetailer } from './factory.js';
import { castoramaRetailer } from './castorama.js';
import { boulangerRetailer } from './boulanger.js';
import { optimeaRetailer } from './optimea.js';
import { amazonRetailer } from './amazon.js';

/**
 * Registre des enseignes. URLs et méthodes issues de la reconnaissance
 * du 2026-06-28. Tier 'http' = vérifié fonctionnel ; tier 'browser' =
 * nécessite Playwright (anti-bot fort ou stock rendu en JS).
 */
export const RETAILERS: Retailer[] = [
  // ---- Tier HTTP (fiable, sans navigateur) ----
  boulangerRetailer({ postalCode: '75011' }),
  castoramaRetailer({
    // Livraison + magasin le plus proche de chez toi (Paris).
    postalCode: '75011',
    lat: 48.8566,
    lng: 2.3522,
  }),
  optimeaRetailer(),

  // ---- Tier navigateur (Playwright requis) ----
  amazonRetailer(),
  browserRetailer({
    id: 'leroymerlin',
    name: 'Leroy Merlin',
    url: 'https://www.leroymerlin.fr/produits/climatiseur-split-mobile-reversible-portasplit-midea-par-optimea-93857579.html',
    recon:
      'DataDome strict (IP datacenter blacklistée). Stock réel via gateway Adeo ' +
      'api.leroymerlin.fr (header x-square-api-key) — voir docs/api-notes.md. ' +
      'Nécessite proxy résidentiel FR.',
  }),
  browserRetailer({
    id: 'manomano',
    name: 'ManoMano',
    url: 'https://www.manomano.fr/p/midea-climatiseur-split-mobile-reversible-froid-chaud-3500w12000btu-wifi-deshumidificateur-ventilateur-jusqua-40m2-kit-fenetre-inclus-83810402',
    recon: 'Cloudflare passé en stealth ; JSON-LD Offer.availability (vendeur Optimea).',
  }),
  // Auchan retiré : produit DÉRÉFÉRENCÉ ("n'est plus dans notre gamme"),
  // GTIN absent du catalogue. Voir docs/api-notes.md. À ré-ajouter s'il revient.
  browserRetailer({
    id: 'mrbricolage',
    name: 'Mr.Bricolage',
    url: 'https://www.mr-bricolage.fr/climatiseur-split-mobile-midea-3500w-optimea.html',
    recon: 'Cloudflare.',
  }),
  browserRetailer({
    id: 'bricoman',
    name: 'Bricoman',
    url: 'https://www.bricoman.fr/produits/climatiseur-mobile-reversible-portasplit-midea-25088072.html',
    recon: 'DataDome.',
  }),
  browserRetailer({
    id: 'fnac',
    name: 'Fnac',
    url: 'https://www.fnac.com/MIDEA-Climatiseur-Split-Mobile-Reversible-Froid-Chaud-3500W-12000BTU-WiFi-deshumidificateur-ventilateur-jusqu-a-40m2-kit-fenetre-inclus/a21457105/w-4',
    recon: 'DataDome (compte partagé Fnac/Darty) — proxy+CAPTCHA requis. Voir docs/api-notes.md.',
  }),
  browserRetailer({
    id: 'darty',
    name: 'Darty',
    url: 'https://www.darty.com/nav/achat/gros_electromenager/chauffage_climatisation/climatiseur/midea_mmcs-12hrn8-qrd0.html',
    recon: 'DataDome — endpoints click_and_collect connus mais bloqués. Voir docs/api-notes.md.',
  }),
];

export function selectRetailers(only?: string[]): Retailer[] {
  if (!only || only.length === 0) return RETAILERS;
  const set = new Set(only.map((s) => s.toLowerCase()));
  return RETAILERS.filter((r) => set.has(r.id));
}
