/**
 * ITU-R P.839-4 — Hauteur de pluie pour la modélisation de la propagation.
 *
 *   h_R = h_0 + 0.36   (km au-dessus du niveau de la mer)
 *
 * où h_0 est l'altitude moyenne annuelle de l'isotherme 0 °C, donnée par une
 * grille numérique mondiale (1.5°). On n'embarque pas la grille complète : on
 * fournit une approximation latitudinale raisonnable, suffisante pour le
 * pré-dimensionnement, et un point d'entrée `setRainHeightGrid` pour brancher
 * la vraie grille P.839 plus tard.
 *
 * L'approximation suit la forme générale de la grille : h_0 ≈ 5 km sous les
 * tropiques, décroissant vers les pôles, avec une légère asymétrie N/S.
 */

type RainHeightProvider = (latDeg: number, lonDeg: number) => number;

let externalProvider: RainHeightProvider | null = null;

/**
 * Branche une grille P.839 réelle (interpolée) si disponible.
 * Le provider doit renvoyer h_0 (km) pour une latitude/longitude données.
 */
export function setRainHeightGrid(provider: RainHeightProvider | null): void {
  externalProvider = provider;
}

/** Altitude approximative de l'isotherme 0 °C h_0 (km) selon la latitude. */
export function zeroIsothermHeight(latDeg: number, lonDeg = 0): number {
  if (externalProvider) return externalProvider(latDeg, lonDeg);
  const phi = Math.abs(latDeg);
  // Ajustement empirique (forme proche des cartes P.839) :
  //  - plateau ~5 km de l'équateur à ~23°
  //  - décroissance quasi linéaire jusqu'à ~0.5 km vers 80°
  let h0: number;
  if (phi <= 23) {
    h0 = 5.0 - 0.012 * phi;
  } else {
    h0 = 4.72 - 0.075 * (phi - 23);
  }
  return Math.max(0, h0);
}

/** Hauteur de pluie h_R (km) = h_0 + 0.36. */
export function rainHeight(latDeg: number, lonDeg = 0): number {
  return zeroIsothermHeight(latDeg, lonDeg) + 0.36;
}
