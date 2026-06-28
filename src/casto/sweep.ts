/**
 * Sweep EXHAUSTIF du stock Castorama sur TOUTE la France.
 *
 * Récupère les ~97 magasins du pays et interroge le stock réel de chacun
 * (magasin + retrait 2h), plus la livraison à domicile. Concurrence limitée,
 * retries, tri par distance de chez toi, export JSON.
 *
 * Usage :
 *   npm run casto:stock                 # depuis ton CP par défaut (35170)
 *   npm run casto:stock -- --cp=75001   # recentrer le tri sur un autre CP
 *   npm run casto:stock -- --all        # afficher les 97 magasins (pas que les hits)
 *   npm run casto:stock -- --json       # sortie JSON brute
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  fetchAllStores,
  fulfilment,
  buyable,
  haversineKm,
  pool,
  withRetry,
  PRODUCT_URL,
  type Store,
  type Fulfilment,
} from './api.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

// CP de référence -> coordonnées GPS pour le tri par distance.
const HOME = { cp: '75011', lat: 48.8566, lng: 2.3522 }; // Paris
// Quelques CP connus pour recentrer rapidement (sinon on garde HOME).
const KNOWN_CP: Record<string, [number, number]> = {
  '35170': [48.0698, -1.7374],
  '75001': [48.8607, 2.3358],
  '69001': [45.7679, 4.8336],
  '13001': [43.2989, 5.3805],
  '33000': [44.8378, -0.5792],
  '59000': [50.6292, 3.0573],
  '31000': [43.6047, 1.4442],
  '44000': [47.2184, -1.5536],
  '06000': [43.7102, 7.262],
  '67000': [48.5734, 7.7521],
  '34000': [43.6108, 3.8767],
  '80000': [49.8941, 2.2958],
};

interface Row {
  store: Store;
  distanceKm: number;
  fulfil: Fulfilment | null;
  error?: string;
}

function channels(f: Fulfilment): string[] {
  const out: string[] = [];
  if (buyable(f.inStore))
    out.push(`magasin (q${f.inStore.quantity ?? '?'})`);
  if (buyable(f.clickAndCollect))
    out.push(`retrait 2h (q${f.clickAndCollect.quantity ?? '?'})`);
  if (buyable(f.homeDelivery))
    out.push(`livraison (q${f.homeDelivery.quantity ?? '?'})`);
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cpArg = argv.find((a) => a.startsWith('--cp='))?.slice(5);
  const showAll = argv.includes('--all');
  const asJson = argv.includes('--json');

  const home =
    cpArg && KNOWN_CP[cpArg]
      ? { cp: cpArg, lat: KNOWN_CP[cpArg][0], lng: KNOWN_CP[cpArg][1] }
      : HOME;

  if (!asJson)
    process.stderr.write(`Récupération de tous les magasins Castorama…\n`);
  const stores = await withRetry(() => fetchAllStores());
  if (!asJson)
    process.stderr.write(
      `${stores.length} magasins trouvés. Interrogation du stock (parallèle)…\n`,
    );

  const rows: Row[] = await pool(
    stores,
    8, // concurrence
    async (store): Promise<Row> => {
      const distanceKm = haversineKm(home.lat, home.lng, store.lat, store.lng);
      try {
        const f = await withRetry(() => fulfilment(store.id, store.postalCode), 3);
        return { store, distanceKm, fulfil: f };
      } catch (err) {
        return {
          store,
          distanceKm,
          fulfil: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    (done, total) => {
      if (!asJson && done % 10 === 0)
        process.stderr.write(`  …${done}/${total}\n`);
    },
  );

  rows.sort((a, b) => a.distanceKm - b.distanceKm);

  const inStock = rows.filter((r) => r.fulfil && channels(r.fulfil).length > 0);
  const errors = rows.filter((r) => r.error);
  const homeDeliveryOk = rows.some((r) => r.fulfil && buyable(r.fulfil.homeDelivery));

  // Export pour historique / alerting.
  const outFile = join(
    dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
    '.casto-stock.json',
  );
  await writeFile(
    outFile,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        product: PRODUCT_URL,
        center: home,
        totalStores: stores.length,
        inStock: inStock.map((r) => ({
          store: r.store.name,
          city: r.store.city,
          postalCode: r.store.postalCode,
          distanceKm: r.distanceKm,
          channels: r.fulfil ? channels(r.fulfil) : [],
        })),
        homeDeliveryOk,
        errors: errors.length,
      },
      null,
      2,
    ),
  );

  if (asJson) {
    console.log(
      JSON.stringify(
        rows.map((r) => ({ ...r.store, distanceKm: r.distanceKm, fulfil: r.fulfil, error: r.error })),
        null,
        2,
      ),
    );
    return;
  }

  if (showAll) {
    console.log(`\n${C.bold}Tous les magasins (${rows.length}) :${C.reset}`);
    for (const r of rows) {
      const st = r.fulfil
        ? channels(r.fulfil).length
          ? `${C.green}${channels(r.fulfil).join(', ')}${C.reset}`
          : `${C.red}rupture${C.reset}`
        : `${C.dim}err${C.reset}`;
      console.log(
        `  ${String(r.distanceKm + 'km').padStart(7)}  ${r.store.name.padEnd(34)} ${r.store.postalCode}  ${st}`,
      );
    }
  }

  console.log(`\n${C.bold}═══════════════ RÉSULTAT ═══════════════${C.reset}`);
  console.log(
    `${stores.length} magasins balayés · tri depuis ${home.cp} · ${errors.length} erreur(s)`,
  );

  if (inStock.length === 0) {
    console.log(
      `\n${C.red}${C.bold}❌ RUPTURE NATIONALE${C.reset} — aucun stock dans aucun magasin, ni en livraison.`,
    );
  } else {
    console.log(
      `\n${C.green}${C.bold}🎉 ${inStock.length} MAGASIN(S) AVEC STOCK :${C.reset}`,
    );
    for (const r of inStock) {
      console.log(
        `  ${C.green}${C.bold}→ ${r.store.name}${C.reset} (${r.store.city} ${r.store.postalCode}) · ${C.cyan}${r.distanceKm} km${C.reset}`,
      );
      console.log(
        `     ${C.green}${channels(r.fulfil!).join(' · ')}${C.reset}  ☎ ${r.store.phone || '—'}`,
      );
    }
  }
  console.log(
    `\nLivraison à domicile : ${homeDeliveryOk ? `${C.green}DISPONIBLE${C.reset}` : `${C.red}non disponible${C.reset}`}`,
  );
  console.log(`${C.dim}Détail complet écrit dans .casto-stock.json${C.reset}`);
}

main().catch((err) => {
  console.error('Erreur sweep :', err);
  process.exit(1);
});
