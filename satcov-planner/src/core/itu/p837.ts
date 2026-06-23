/**
 * ITU-R P.837-7 — Taux de pluie R_0.01 dépassé 0.01 % du temps (mm/h).
 *
 * La recommandation fournit une grille numérique mondiale. Nous ne l'embarquons
 * pas ici : pour le pré-dimensionnement, R_0.01 est soit saisi directement par
 * l'utilisateur, soit choisi parmi des presets de zones climatiques (anciennes
 * régions hydrométéorologiques P.837 / Crane), soit fourni par une grille réelle
 * branchée via `setRainfallGrid`.
 */

type RainfallProvider = (latDeg: number, lonDeg: number) => number;

let externalProvider: RainfallProvider | null = null;

/** Branche une grille P.837 réelle (interpolée) renvoyant R_0.01 (mm/h). */
export function setRainfallGrid(provider: RainfallProvider | null): void {
  externalProvider = provider;
}

/**
 * Presets de R_0.01 (mm/h) par type de climat — ordres de grandeur usuels
 * pour le dimensionnement. À affiner avec la grille P.837 réelle.
 */
export const RAIN_PRESETS: Record<string, { label: string; r001: number }> = {
  arid: { label: 'Aride / désertique', r001: 8 },
  mediterranean: { label: 'Méditerranéen', r001: 30 },
  temperate: { label: 'Tempéré océanique', r001: 32 },
  continental: { label: 'Continental', r001: 42 },
  subtropical: { label: 'Subtropical humide', r001: 65 },
  tropical: { label: 'Tropical / mousson', r001: 95 },
  equatorial: { label: 'Équatorial très humide', r001: 145 },
};

/**
 * R_0.01 (mm/h) pour une position. Utilise la grille branchée si présente,
 * sinon une approximation latitudinale grossière (à n'utiliser qu'en repli).
 */
export function rainfallRate001(latDeg: number, lonDeg = 0): number {
  if (externalProvider) return externalProvider(latDeg, lonDeg);
  // Repli très approximatif : maximum équatorial, minimum aux pôles/déserts.
  const phi = Math.abs(latDeg);
  if (phi < 10) return 95;
  if (phi < 25) return 60;
  if (phi < 40) return 35;
  if (phi < 55) return 28;
  if (phi < 70) return 14;
  return 6;
}
