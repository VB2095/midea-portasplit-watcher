import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Availability, CheckResult } from '../types.js';

const STATE_FILE = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  '.state.json',
);

interface StoredState {
  [retailerId: string]: { status: Availability; checkedAt: string };
}

export interface Transition {
  retailer: string;
  url: string;
  from: Availability;
  to: Availability;
}

async function load(): Promise<StoredState> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8')) as StoredState;
  } catch {
    return {};
  }
}

/**
 * Compare les résultats à l'état précédent, persiste le nouvel état, et
 * renvoie les transitions vers "achetable" (le signal d'alerte).
 */
export async function diffAndSave(
  results: CheckResult[],
): Promise<Transition[]> {
  const prev = await load();
  const next: StoredState = {};
  const transitions: Transition[] = [];

  for (const r of results) {
    const before = prev[r.retailerId]?.status;
    next[r.retailerId] = { status: r.status, checkedAt: r.checkedAt };

    const becameBuyable =
      (r.status === 'in_stock' || r.status === 'limited') &&
      before !== undefined &&
      before !== 'in_stock' &&
      before !== 'limited';

    if (becameBuyable) {
      transitions.push({
        retailer: r.retailer,
        url: r.url,
        from: before,
        to: r.status,
      });
    }
  }

  await writeFile(STATE_FILE, JSON.stringify(next, null, 2));
  return transitions;
}
