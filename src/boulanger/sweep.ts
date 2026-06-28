/**
 * Sweep EXHAUSTIF du stock magasin Boulanger sur TOUTE la France.
 *
 * Boucle sur un maillage de villes ; pour chaque point, `lastStock` ramène les
 * ~10 magasins-avec-stock les plus proches. L'union dédupliquée par siteId =
 * tous les magasins du réseau ayant du stock. Plus la dispo livraison (online).
 *
 * Usage : npm run boulanger:stock         (tri depuis 35170 par défaut)
 *         npm run boulanger:stock -- --json
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getOfferContext,
  lastStock,
  FRANCE_GRID,
  haversineKm,
  PRODUCT_URL,
  type BoulangerStore,
} from './api.js';
import { pool, withRetry } from '../lib/util.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const HOME = { lat: 48.8566, lng: 2.3522, cp: '75011' }; // Paris

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  if (!asJson) process.stderr.write('Contexte produit Boulanger…\n');
  const offer = await withRetry(() => getOfferContext());
  if (!asJson)
    process.stderr.write(
      `offerId ${offer.offerId.slice(0, 8)}… · online=${offer.online} · maillage ${FRANCE_GRID.length} villes…\n`,
    );

  const lists = await pool(
    FRANCE_GRID,
    6,
    (pt) =>
      withRetry(() =>
        lastStock(offer, { location: { latitude: pt.lat, longitude: pt.lng } }),
      ).catch(() => [] as BoulangerStore[]),
    (done, total) => {
      if (!asJson && done % 10 === 0) process.stderr.write(`  …${done}/${total}\n`);
    },
  );

  // Dédup par siteId, on garde la quantité max vue.
  const byId = new Map<string, BoulangerStore>();
  for (const list of lists)
    for (const s of list) {
      const prev = byId.get(s.siteId);
      if (!prev || s.quantity > prev.quantity) byId.set(s.siteId, s);
    }
  const stores = [...byId.values()]
    .map((s) => ({ ...s, distanceKm: haversineKm(HOME.lat, HOME.lng, s.lat, s.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const inStock = stores.filter((s) => s.quantity > 0);

  const outFile = join(
    dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
    '.boulanger-stock.json',
  );
  await writeFile(
    outFile,
    JSON.stringify(
      { checkedAt: new Date().toISOString(), product: PRODUCT_URL, online: offer.online, inStock },
      null,
      2,
    ),
  );

  if (asJson) {
    console.log(JSON.stringify({ online: offer.online, stores }, null, 2));
    return;
  }

  console.log(`\n${C.bold}═══════════ RÉSULTAT Boulanger ═══════════${C.reset}`);
  console.log(
    `${FRANCE_GRID.length} zones balayées · ${byId.size} magasins vus · livraison online: ${offer.online === 'in_stock' ? C.green + 'DISPO' : C.red + 'non'}${C.reset}`,
  );
  if (inStock.length === 0) {
    console.log(`\n${C.red}${C.bold}❌ Aucun magasin Boulanger avec stock.${C.reset}`);
  } else {
    console.log(`\n${C.green}${C.bold}🎉 ${inStock.length} MAGASIN(S) AVEC STOCK :${C.reset}`);
    for (const s of inStock)
      console.log(
        `  ${C.green}${C.bold}→ ${s.label}${C.reset} (${s.city} ${s.postalCode}) · q${s.quantity} · ${C.cyan}${s.distanceKm} km${C.reset}`,
      );
  }
  console.log(`${C.dim}Détail dans .boulanger-stock.json${C.reset}`);
}

main().catch((err) => {
  console.error('Erreur sweep Boulanger :', err);
  process.exit(1);
});
