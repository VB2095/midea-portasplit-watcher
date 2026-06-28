import type { Availability, CheckResult } from '../types.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m',
};

const LABEL: Record<Availability, string> = {
  in_stock: '✅ EN STOCK',
  limited: '🟡 STOCK LIMITÉ',
  preorder: '🔵 PRÉCOMMANDE',
  out_of_stock: '❌ Rupture',
  unknown: '❔ Inconnu',
  blocked: '🛡️  Bloqué',
  not_found: '🚫 Absent',
  error: '⚠️  Erreur',
};

function color(status: Availability): string {
  switch (status) {
    case 'in_stock':
    case 'limited':
      return C.green;
    case 'out_of_stock':
      return C.red;
    case 'preorder':
      return C.blue;
    case 'unknown':
    case 'blocked':
      return C.yellow;
    default:
      return C.gray;
  }
}

function pad(s: string, n: number): string {
  // longueur visible (ignore les codes ANSI) approximée par s sans emoji width
  const len = [...s].length;
  return s + ' '.repeat(Math.max(0, n - len));
}

export function formatTable(results: CheckResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    const status = `${color(r.status)}${pad(LABEL[r.status], 16)}${C.reset}`;
    const name = `${C.bold}${pad(r.retailer, 20)}${C.reset}`;
    const price = r.price != null ? `${r.price} €` : '—';
    const via = `${C.dim}${r.via}${C.reset}`;
    let line = `  ${status} ${name} ${pad(price, 10)} ${via}`;
    if (r.note) line += `\n      ${C.gray}↳ ${r.note}${C.reset}`;
    lines.push(line);
  }
  return lines.join('\n');
}

export function formatBuyable(results: CheckResult[]): string | null {
  const buyable = results.filter(
    (r) => r.status === 'in_stock' || r.status === 'limited',
  );
  if (buyable.length === 0) return null;
  const lines = buyable.map(
    (r) =>
      `  ${C.green}${C.bold}→ ${r.retailer}${C.reset}  ${
        r.price != null ? `${r.price} €  ` : ''
      }${C.blue}${r.url}${C.reset}`,
  );
  return `${C.green}${C.bold}🎉 DISPONIBLE MAINTENANT :${C.reset}\n${lines.join('\n')}`;
}
