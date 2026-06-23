/**
 * Bilan de liaison simplifié (Module 3) — descendant et montant.
 *
 * Toutes les puissances sont en dB(W)/dBi/dB. Fréquences en GHz, distances en km.
 * Les formules sont les bilans classiques EIRP / FSPL / C/N0.
 */

import { BOLTZMANN_DB, C_LIGHT } from './constants';

/** FSPL (dB) = 20·log10(4π·d/λ), d distance, λ longueur d'onde. */
export function fspl(distanceKm: number, freqGHz: number): number {
  const dM = distanceKm * 1000;
  const lambda = C_LIGHT / (freqGHz * 1e9);
  return 20 * Math.log10((4 * Math.PI * dM) / lambda);
}

/**
 * Gain d'antenne à partir de la largeur de faisceau à -3 dB (HPBW).
 *   G(dBi) ≈ 10·log10(η · 27000 / θ²),  θ = HPBW en degrés.
 * @param hpbwDeg largeur de faisceau à -3 dB (°)
 * @param efficiency rendement d'antenne η (0–1), typiquement 0.55–0.65
 */
export function gainFromHpbw(hpbwDeg: number, efficiency = 0.6): number {
  return 10 * Math.log10((efficiency * 27000) / (hpbwDeg * hpbwDeg));
}

/** HPBW (°) correspondant à un gain donné (inverse de gainFromHpbw). */
export function hpbwFromGain(gainDbi: number, efficiency = 0.6): number {
  const linear = Math.pow(10, gainDbi / 10);
  return Math.sqrt((efficiency * 27000) / linear);
}

/** EIRP (dBW) = Pt (dBW) + G (dBi) - pertes de ligne (dB). */
export function eirp(ptDbw: number, gainDbi: number, lineLossDb = 0): number {
  return ptDbw + gainDbi - lineLossDb;
}

/** Diamètre d'antenne (m) approximatif pour une HPBW et fréquence données.
 *  HPBW ≈ 70·λ/D  →  D ≈ 70·λ/HPBW. */
export function dishDiameterFromHpbw(
  hpbwDeg: number,
  freqGHz: number,
): number {
  const lambda = C_LIGHT / (freqGHz * 1e9);
  return (70 * lambda) / hpbwDeg;
}

export interface LinkBudgetInput {
  freqGHz: number;
  /** Portée oblique émetteur→récepteur (km). */
  slantRangeKm: number;
  /** EIRP de l'émetteur (dBW). */
  eirpDbw: number;
  /** Facteur de mérite du récepteur G/T (dB/K). */
  gOverTdBK: number;
  /** Pertes atmosphériques hors pluie (gaz, nuages…) (dB). */
  atmoLossDb?: number;
  /** Atténuation due à la pluie (dB). */
  rainAttenuationDb?: number;
  /** Pertes diverses de pointage/implémentation (dB). */
  miscLossDb?: number;
}

export interface LinkBudgetResult {
  /** C/N0 (dB-Hz). */
  cn0DbHz: number;
  fsplDb: number;
  /** Pertes totales de propagation (FSPL + atmo + pluie + divers) (dB). */
  totalLossDb: number;
}

/**
 * C/N0 = EIRP − FSPL − pertes atmo − pluie − divers + G/T + 228.6.
 */
export function computeCN0(input: LinkBudgetInput): LinkBudgetResult {
  const {
    freqGHz,
    slantRangeKm,
    eirpDbw,
    gOverTdBK,
    atmoLossDb = 0,
    rainAttenuationDb = 0,
    miscLossDb = 0,
  } = input;
  const fsplDb = fspl(slantRangeKm, freqGHz);
  const totalLossDb = fsplDb + atmoLossDb + rainAttenuationDb + miscLossDb;
  const cn0DbHz = eirpDbw - totalLossDb + gOverTdBK + BOLTZMANN_DB;
  return { cn0DbHz, fsplDb, totalLossDb };
}

/** C/N (dB) = C/N0 − 10·log10(B), B largeur de bande (Hz). */
export function cn0ToCn(cn0DbHz: number, bandwidthHz: number): number {
  return cn0DbHz - 10 * Math.log10(bandwidthHz);
}

/**
 * EIRP nécessaire (dBW) pour atteindre un C/N requis au bord de couverture.
 * On résout le bilan à l'envers à partir de computeCN0.
 */
export function requiredEirp(params: {
  freqGHz: number;
  slantRangeKm: number;
  cnRequiredDb: number;
  bandwidthHz: number;
  gOverTdBK: number;
  atmoLossDb?: number;
  rainAttenuationDb?: number;
  miscLossDb?: number;
}): number {
  const {
    freqGHz,
    slantRangeKm,
    cnRequiredDb,
    bandwidthHz,
    gOverTdBK,
    atmoLossDb = 0,
    rainAttenuationDb = 0,
    miscLossDb = 0,
  } = params;
  const fsplDb = fspl(slantRangeKm, freqGHz);
  const cn0Required = cnRequiredDb + 10 * Math.log10(bandwidthHz);
  // cn0 = eirp - totalLoss + g/t + 228.6  →  eirp = cn0 - g/t - 228.6 + totalLoss
  const totalLossDb = fsplDb + atmoLossDb + rainAttenuationDb + miscLossDb;
  return cn0Required - gOverTdBK - BOLTZMANN_DB + totalLossDb;
}

/**
 * Puissance d'émission requise Pt (dBW) pour une antenne (gain) donnée,
 * à partir de l'EIRP requis.
 */
export function requiredPt(
  eirpRequiredDbw: number,
  gainDbi: number,
  lineLossDb = 0,
): number {
  return eirpRequiredDbw - gainDbi + lineLossDb;
}

/** Conversion dBW ↔ W. */
export const dbwToWatt = (dbw: number) => Math.pow(10, dbw / 10);
export const wattToDbw = (w: number) => 10 * Math.log10(w);
