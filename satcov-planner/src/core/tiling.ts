/**
 * Module 5 — Type de pavage : faisceau unique vs spots multiples.
 *
 * À partir de la HPBW maximale acceptable par spot (déduite de l'EIRP/marge
 * requis, Modules 3 & 4) et de la taille angulaire de la zone à couvrir vue du
 * satellite, on décide : un seul faisceau suffit, ou il faut un pavage
 * hexagonal de N cellules.
 */

import { gainFromHpbw } from './linkbudget';
import { beamHalfAngleAtLevel } from './geometry';

export type Verdict = 'single' | 'multi';

export interface TilingInput {
  /** Demi-angle (°) de la zone à couvrir vue du satellite. */
  coverageHalfAngleDeg: number;
  /** HPBW maximale acceptable par spot (°) pour tenir le bilan de liaison. */
  maxHpbwDeg: number;
  /** Rendement d'antenne. */
  efficiency?: number;
  /**
   * Niveau de croisement entre spots adjacents (dB), typiquement 3 à 4.3.
   * Détermine l'espacement des centres = 2·HalfAngle(level).
   */
  crossoverLevelDb?: number;
  /** Schéma de réutilisation de fréquence/polarisation (3 ou 4 couleurs). */
  colors?: 3 | 4;
}

export interface SpotCell {
  /** Décalage angulaire (°) par rapport au boresight central, en repère u/v. */
  uDeg: number;
  vDeg: number;
  /** Index de couleur (réutilisation de fréquence/polarisation). */
  color: number;
}

export interface TilingResult {
  verdict: Verdict;
  /** Nombre de spots (1 si faisceau unique). */
  nSpots: number;
  /** HPBW par spot (°). */
  spotHpbwDeg: number;
  /** Gain par spot (dBi). */
  spotGainDbi: number;
  /** Cellules du pavage (vide si faisceau unique). */
  cells: SpotCell[];
  /** Nombre de couleurs effectif. */
  colors: number;
}

/**
 * Génère un pavage hexagonal de spots couvrant un disque de demi-angle donné,
 * avec un espacement des centres correspondant au niveau de croisement.
 */
function hexTiling(
  coverageHalfAngleDeg: number,
  spotHpbwDeg: number,
  crossoverLevelDb: number,
  colors: number,
): SpotCell[] {
  // Espacement des centres = 2× le demi-angle au niveau de croisement.
  const spacing = 2 * beamHalfAngleAtLevel(spotHpbwDeg, crossoverLevelDb);
  if (spacing <= 0) return [];

  // Grille hexagonale (coordonnées axiales) couvrant le disque.
  const cells: SpotCell[] = [];
  const ringCount = Math.ceil(coverageHalfAngleDeg / spacing) + 1;
  const dx = spacing;
  const dy = spacing * Math.sqrt(3) / 2;

  for (let row = -ringCount; row <= ringCount; row++) {
    const vDeg = row * dy;
    const xOffset = (row & 1) === 0 ? 0 : dx / 2;
    for (let col = -ringCount; col <= ringCount; col++) {
      const uDeg = col * dx + xOffset;
      const dist = Math.hypot(uDeg, vDeg);
      if (dist > coverageHalfAngleDeg + spacing / 2) continue;
      // Affectation de couleur par schéma hexagonal (offset row/col).
      const color = colorIndex(row, col, colors);
      cells.push({ uDeg, vDeg, color });
    }
  }
  return cells;
}

/**
 * Affectation de couleur pour un schéma de réutilisation hexagonale.
 * Schémas 3 et 4 couleurs basés sur les coordonnées de la cellule.
 */
function colorIndex(row: number, col: number, colors: number): number {
  if (colors === 3) {
    return ((col + 2 * row) % 3 + 3) % 3;
  }
  // 4 couleurs : combinaison parité ligne / parité colonne.
  return ((row & 1) << 1) | (col & 1);
}

export function planTiling(input: TilingInput): TilingResult {
  const {
    coverageHalfAngleDeg,
    maxHpbwDeg,
    efficiency = 0.6,
    crossoverLevelDb = 4.3,
    colors = 4,
  } = input;

  // Un seul faisceau couvre la zone si sa HPBW peut être ≥ taille zone (×2)
  // tout en restant ≤ HPBW max admissible.
  const requiredSingleHpbw = 2 * coverageHalfAngleDeg;

  if (requiredSingleHpbw <= maxHpbwDeg) {
    const hpbw = requiredSingleHpbw;
    return {
      verdict: 'single',
      nSpots: 1,
      spotHpbwDeg: hpbw,
      spotGainDbi: gainFromHpbw(hpbw, efficiency),
      cells: [],
      colors: 1,
    };
  }

  // Sinon : pavage de spots à la HPBW max admissible.
  const spotHpbw = maxHpbwDeg;
  const cells = hexTiling(coverageHalfAngleDeg, spotHpbw, crossoverLevelDb, colors);
  return {
    verdict: 'multi',
    nSpots: cells.length,
    spotHpbwDeg: spotHpbw,
    spotGainDbi: gainFromHpbw(spotHpbw, efficiency),
    cells,
    colors,
  };
}
