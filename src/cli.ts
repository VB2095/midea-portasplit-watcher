import { PRODUCT, DEFAULT_TIMEOUT_MS } from './config.js';
import { selectRetailers } from './retailers/index.js';
import { runChecks } from './check.js';
import { diffAndSave } from './lib/state.js';
import { formatTable, formatBuyable } from './lib/format.js';
import { closeBrowser } from './lib/browser.js';
import type { CheckResult } from './types.js';

interface Args {
  browser: boolean;
  json: boolean;
  watch: boolean;
  intervalMin: number;
  only?: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    browser: argv.includes('--browser'),
    json: argv.includes('--json'),
    watch: argv.includes('--watch'),
    intervalMin: 15,
  };
  for (const a of argv) {
    if (a.startsWith('--only=')) args.only = a.slice(7).split(',');
    if (a.startsWith('--interval=')) args.intervalMin = Number(a.slice(11)) || 15;
  }
  return args;
}

async function once(args: Args): Promise<CheckResult[]> {
  const retailers = selectRetailers(args.only);
  const results = await runChecks(retailers, {
    browser: args.browser,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  const transitions = await diffAndSave(results);

  if (args.json) {
    console.log(JSON.stringify({ product: PRODUCT.name, results }, null, 2));
    return results;
  }

  const stamp = new Date().toLocaleString('fr-FR');
  console.log(`\n📡 ${PRODUCT.name}`);
  console.log(`   ${stamp}\n`);
  console.log(formatTable(results));

  const buyable = formatBuyable(results);
  if (buyable) console.log(`\n${buyable}`);

  if (transitions.length > 0) {
    console.log('\n\x1b[1m\x1b[42m\x1b[30m  🔔 NOUVEAU EN STOCK !  \x1b[0m');
    for (const t of transitions) {
      console.log(`   ${t.retailer} : ${t.from} → ${t.to}\n   ${t.url}`);
    }
  }
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.watch) {
    await once(args);
    await closeBrowser();
    return;
  }

  console.log(
    `👀 Surveillance toutes les ${args.intervalMin} min (Ctrl+C pour arrêter).`,
  );
  // boucle simple ; pour la prod, préférer un cron (voir README).
  for (;;) {
    try {
      await once(args);
    } catch (err) {
      console.error('Erreur de cycle :', err);
    }
    await new Promise((r) => setTimeout(r, args.intervalMin * 60_000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
