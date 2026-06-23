/**
 * Constantes physiques et géodésiques partagées par le cœur de calcul.
 * Tout est en SI sauf mention contraire (fréquences en GHz dans les modules RF,
 * distances en km côté orbite/géométrie pour rester cohérent avec satellite.js).
 */

/** Vitesse de la lumière (m/s). */
export const C_LIGHT = 299_792_458;

/** Rayon équatorial WGS84 (km). */
export const WGS84_A = 6378.137;
/** Rayon polaire WGS84 (km). */
export const WGS84_B = 6356.752314245;
/** Aplatissement WGS84. */
export const WGS84_F = 1 / 298.257223563;
/** Excentricité² WGS84. */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** Rayon terrestre moyen (km) — utilisé pour les approximations sphériques. */
export const EARTH_R_MEAN = 6371.0;

/**
 * Rayon terrestre effectif pour la propagation troposphérique (km), k=4/3.
 * Utilisé par P.618 pour les angles de site faibles.
 */
export const EARTH_R_EFFECTIVE = 8500.0;

/** Constante de Boltzmann exprimée en dB (10·log10(k)) → 228.6 dBW/K/Hz. */
export const BOLTZMANN_DB = 228.6;

/** Altitude géostationnaire (km). */
export const GEO_ALTITUDE = 35_786;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Convertit une fréquence en GHz vers une longueur d'onde en mètres. */
export function wavelengthM(freqGHz: number): number {
  return C_LIGHT / (freqGHz * 1e9);
}
