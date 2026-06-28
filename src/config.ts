/**
 * Identité du produit cible — partagée par tous les adapters.
 * Climatiseur split mobile réversible "PortaSplit" Midea, vendu sous marque
 * Optimea chez Leroy Merlin. Même appareil partout (mêmes GTIN / réf Midea).
 */
export const PRODUCT = {
  name: 'Midea PortaSplit / Optimea — clim split mobile réversible 3500W (12000 BTU)',
  gtin13: '8431312260509',
  mideaRef: 'MMCS-12HRN8-QRD0',
  amazonAsin: 'B0CY2YW8BT',
  /** Prix public de référence constaté (€). Sert juste de repère. */
  refPrice: 999,
} as const;

/** Timeout par défaut d'un check (ms). */
export const DEFAULT_TIMEOUT_MS = 25_000;
