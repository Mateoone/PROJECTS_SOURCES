/**
 * ITU-R P.618-13 §2.2.1.1 — Prévision de l'atténuation due à la pluie sur un
 * trajet Terre-espace, dépassée pour un pourcentage de temps p donné.
 *
 * Entrées : fréquence, angle de site, latitude station, altitude station,
 * R_0.01 (P.837), hauteur de pluie h_R (P.839), coefficients k/α (P.838).
 *
 * Validé sur l'exemple numérique de l'Annexe / cas connus (voir p618.test.ts).
 */

import { EARTH_R_EFFECTIVE } from '../constants';
import { rainCoefficients, type Polarization } from './p838';
import { rainHeight } from './p839';
import { rainfallRate001 } from './p837';

const DEG2RAD = Math.PI / 180;

export interface RainAttenuationInput {
  freqGHz: number;
  /** Angle de site du trajet (°). */
  elevationDeg: number;
  /** Latitude de la station sol (°). */
  latDeg: number;
  /** Longitude de la station sol (°) — pour les grilles P.837/P.839. */
  lonDeg?: number;
  /** Altitude de la station sol au-dessus du niveau de la mer (km). */
  hsKm?: number;
  /** Taux de pluie R_0.01 (mm/h). Si absent, déduit de P.837. */
  r001?: number;
  /** Hauteur de pluie h_R (km). Si absente, déduite de P.839. */
  hrKm?: number;
  /** Polarisation pour P.838. */
  pol?: Polarization;
  tiltDeg?: number;
}

export interface RainAttenuationResult {
  /** Atténuation A_0.01 dépassée 0.01 % du temps (dB). */
  a001: number;
  /** Atténuation spécifique γ_R (dB/km). */
  gammaR: number;
  /** Longueur effective de trajet L_E (km). */
  effectivePathKm: number;
  /** Longueur de trajet oblique sous la pluie L_s (km). */
  slantPathKm: number;
  r001: number;
  hrKm: number;
}

/**
 * Atténuation A_0.01 et grandeurs intermédiaires (étapes 1 à 8 de P.618).
 */
export function rainAttenuation001(
  input: RainAttenuationInput,
): RainAttenuationResult {
  const {
    freqGHz,
    elevationDeg,
    latDeg,
    lonDeg = 0,
    hsKm = 0,
    pol = 'circular',
    tiltDeg,
  } = input;

  const r001 = input.r001 ?? rainfallRate001(latDeg, lonDeg);
  const hr = input.hrKm ?? rainHeight(latDeg, lonDeg);
  const theta = elevationDeg * DEG2RAD;
  const phi = Math.abs(latDeg);

  // Étape 1–2 : longueur de trajet oblique sous la hauteur de pluie.
  const dh = hr - hsKm;
  if (dh <= 0) {
    // Station au-dessus de la pluie → pas d'atténuation pluie.
    return {
      a001: 0,
      gammaR: 0,
      effectivePathKm: 0,
      slantPathKm: 0,
      r001,
      hrKm: hr,
    };
  }
  let Ls: number;
  if (elevationDeg >= 5) {
    Ls = dh / Math.sin(theta);
  } else {
    Ls =
      (2 * dh) /
      (Math.sqrt(Math.sin(theta) ** 2 + (2 * dh) / EARTH_R_EFFECTIVE) +
        Math.sin(theta));
  }

  // Étape 3 : projection horizontale.
  const Lg = Ls * Math.cos(theta);

  // Étape 4 : atténuation spécifique.
  const { k, alpha } = rainCoefficients(freqGHz, pol, elevationDeg, tiltDeg);
  const gammaR = k * Math.pow(r001, alpha);

  // Étape 5 : facteur de réduction horizontal r_0.01.
  const r001Factor =
    1 /
    (1 +
      0.78 * Math.sqrt((Lg * gammaR) / freqGHz) -
      0.38 * (1 - Math.exp(-2 * Lg)));

  // Étape 6 : facteur d'ajustement vertical v_0.01.
  const zeta = Math.atan2(dh, Lg * r001Factor); // rad
  let Lr: number;
  if (zeta > theta) {
    Lr = (Lg * r001Factor) / Math.cos(theta);
  } else {
    Lr = dh / Math.sin(theta);
  }
  const chi = phi < 36 ? 36 - phi : 0; // degrés
  const v001 =
    1 /
    (1 +
      Math.sqrt(Math.sin(theta)) *
        (31 *
          (1 - Math.exp(-(elevationDeg / (1 + chi)))) *
          (Math.sqrt(Lr * gammaR) / (freqGHz * freqGHz)) -
          0.45));

  // Étape 7 : longueur effective de trajet.
  const Le = Lr * v001;

  // Étape 8 : atténuation dépassée 0.01 % du temps.
  const a001 = gammaR * Le;

  return {
    a001,
    gammaR,
    effectivePathKm: Le,
    slantPathKm: Ls,
    r001,
    hrKm: hr,
  };
}

/**
 * Atténuation A_p dépassée pour un pourcentage p (0.001 ≤ p ≤ 5 %), par
 * extrapolation à partir de A_0.01 (étape 10 de P.618).
 */
export function rainAttenuationForPercent(
  input: RainAttenuationInput,
  percent: number,
): number {
  const { a001 } = rainAttenuation001(input);
  if (a001 <= 0) return 0;
  if (percent === 0.01) return a001;

  const phi = Math.abs(input.latDeg);
  const theta = input.elevationDeg * DEG2RAD;

  let beta: number;
  if (percent >= 1 || phi >= 36) {
    beta = 0;
  } else if (percent < 1 && phi < 36 && input.elevationDeg >= 25) {
    beta = -0.005 * (phi - 36);
  } else {
    beta = -0.005 * (phi - 36) + 1.8 - 4.25 * Math.sin(theta);
  }

  const exponent = -(
    0.655 +
    0.033 * Math.log(percent) -
    0.045 * Math.log(a001) -
    beta * (1 - percent) * Math.sin(theta)
  );

  return a001 * Math.pow(percent / 0.01, exponent);
}

/**
 * Convertit une cible de disponibilité (%) en pourcentage d'indisponibilité.
 * Ex : 99.9 % de disponibilité → 0.1 % d'indisponibilité.
 */
export function availabilityToOutagePercent(availabilityPct: number): number {
  return 100 - availabilityPct;
}

/** Marge de pluie (dB) requise pour une cible de disponibilité donnée. */
export function rainMarginForAvailability(
  input: RainAttenuationInput,
  availabilityPct: number,
): number {
  const p = availabilityToOutagePercent(availabilityPct);
  return rainAttenuationForPercent(input, p);
}
