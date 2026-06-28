/** Statut de disponibilité normalisé, indépendant de l'enseigne. */
export type Availability =
  | 'in_stock' // achetable, livraison/retrait possible
  | 'limited' // dispo mais stock annoncé limité
  | 'preorder' // précommande / réappro annoncé
  | 'out_of_stock' // rupture
  | 'unknown' // page atteinte mais statut illisible
  | 'blocked' // bloqué par anti-bot (DataDome/Cloudflare/Akamai...)
  | 'not_found' // produit absent / page 404
  | 'error'; // erreur réseau / technique

/** Comment l'adapter récupère la donnée. */
export type Tier = 'http' | 'browser';

/** Résultat d'un check pour une enseigne. */
export interface CheckResult {
  retailerId: string;
  retailer: string;
  url: string;
  tier: Tier;
  status: Availability;
  /** Prix en euros si lisible. */
  price: number | null;
  /** Méthode/source de la détection (json-ld, dom, ...). */
  via: string;
  /** Détail libre (message d'erreur, note). */
  note?: string;
  /** Durée du check en ms. */
  ms: number;
  checkedAt: string; // ISO
}

export interface CheckContext {
  /** Inclure les enseignes nécessitant un navigateur headless. */
  browser: boolean;
  /** Timeout par enseigne (ms). */
  timeoutMs: number;
}

export interface Retailer {
  id: string;
  name: string;
  url: string;
  tier: Tier;
  /** Notes recon : anti-bot connu, etc. */
  recon?: string;
  check(ctx: CheckContext): Promise<CheckResult>;
}
