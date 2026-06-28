import type { CheckContext, CheckResult, Retailer } from './types.js';

/** Lance tous les checks en parallèle (chaque adapter gère ses propres erreurs). */
export async function runChecks(
  retailers: Retailer[],
  ctx: CheckContext,
): Promise<CheckResult[]> {
  const results = await Promise.all(retailers.map((r) => r.check(ctx)));
  // Tri : achetable d'abord, puis par enseigne.
  const rank: Record<string, number> = {
    in_stock: 0,
    limited: 1,
    preorder: 2,
    out_of_stock: 3,
    unknown: 4,
    blocked: 5,
    not_found: 6,
    error: 7,
  };
  return results.sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      a.retailer.localeCompare(b.retailer),
  );
}
