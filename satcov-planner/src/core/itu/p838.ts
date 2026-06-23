/**
 * ITU-R P.838-3 — Modèle d'atténuation spécifique due à la pluie.
 *
 * γ_R = k · R^α   (dB/km), R = taux de pluie en mm/h.
 *
 * k et α dépendent de la fréquence (1–1000 GHz), de la polarisation et de
 * l'angle de site. Les coefficients k_H, k_V, α_H, α_V sont obtenus par
 * ajustement log-normal / gaussien (Tables 1–4 de P.838-3), puis combinés
 * pour une polarisation et un angle de site arbitraires (eq. 4 & 5).
 *
 * Validé contre les valeurs tabulées de P.838-3 (voir p838.test.ts).
 */

export type Polarization = 'H' | 'V' | 'circular';

interface CoeffSet {
  /** Amplitudes des termes gaussiens. */
  a: number[];
  /** Centres (en log10 f). */
  b: number[];
  /** Largeurs. */
  c: number[];
  /** Pente du terme linéaire en log10 f. */
  m: number;
  /** Ordonnée à l'origine. */
  ck: number;
}

// --- Coefficients pour k (Tables 1 & 2 de P.838-3) ---
const K_H: CoeffSet = {
  a: [-5.3398, -0.35351, -0.23789, -0.94158],
  b: [-0.10008, 1.2697, 0.86036, 0.64552],
  c: [1.13098, 0.454, 0.15354, 0.16817],
  m: -0.18961,
  ck: 0.71147,
};
const K_V: CoeffSet = {
  a: [-3.80595, -3.44965, -0.39902, 0.50167],
  b: [0.56934, -0.22911, 0.73042, 1.07319],
  c: [0.81061, 0.51059, 0.11899, 0.27195],
  m: -0.16398,
  ck: 0.63297,
};

// --- Coefficients pour α (Tables 3 & 4 de P.838-3) ---
const A_H: CoeffSet = {
  a: [-0.14318, 0.29591, 0.32177, -5.3761, 16.1721],
  b: [1.82442, 0.77564, 0.63773, -0.9623, -3.2998],
  c: [-0.55187, 0.19822, 0.13164, 1.47828, 3.4399],
  m: 0.67849,
  ck: -1.95537,
};
const A_V: CoeffSet = {
  a: [-0.07771, 0.56727, -0.20238, -48.2991, 48.5833],
  b: [2.3384, 0.95545, 1.1452, 0.791669, 0.791459],
  c: [-0.76284, 0.54039, 0.26809, 0.116226, 0.116479],
  m: -0.053739,
  ck: 0.83433,
};

/** Évalue la somme gaussienne + terme linéaire de P.838 en log10(f). */
function evalCoeff(set: CoeffSet, logf: number): number {
  let sum = 0;
  for (let j = 0; j < set.a.length; j++) {
    const z = (logf - set.b[j]) / set.c[j];
    sum += set.a[j] * Math.exp(-(z * z));
  }
  return sum + set.m * logf + set.ck;
}

export interface SpecificAttenuationCoeffs {
  k: number;
  alpha: number;
}

/**
 * Coefficients k et α pour une fréquence, polarisation et angle de site donnés.
 * @param freqGHz fréquence (1–1000 GHz)
 * @param pol polarisation
 * @param elevationDeg angle de site du trajet (°). Par défaut 0 (horizontal).
 * @param tiltDeg angle d'inclinaison de polarisation τ (°) — ignoré sauf pour
 *        une polarisation linéaire quelconque. H→0, V→90, circular→45.
 */
export function rainCoefficients(
  freqGHz: number,
  pol: Polarization = 'circular',
  elevationDeg = 0,
  tiltDeg?: number,
): SpecificAttenuationCoeffs {
  const logf = Math.log10(freqGHz);

  const kH = Math.pow(10, evalCoeff(K_H, logf));
  const kV = Math.pow(10, evalCoeff(K_V, logf));
  const aH = evalCoeff(A_H, logf);
  const aV = evalCoeff(A_V, logf);

  // Angle d'inclinaison de polarisation τ.
  let tau: number;
  if (tiltDeg !== undefined) tau = tiltDeg;
  else if (pol === 'H') tau = 0;
  else if (pol === 'V') tau = 90;
  else tau = 45; // circulaire

  const elRad = (elevationDeg * Math.PI) / 180;
  const tauRad = (tau * Math.PI) / 180;
  const cos2El = Math.cos(elRad) * Math.cos(elRad);
  const cos2Tau = Math.cos(2 * tauRad);

  // Eq. (4) et (5) de P.838-3 — combinaison pour polarisation/site arbitraire.
  const k = (kH + kV + (kH - kV) * cos2El * cos2Tau) / 2;
  const alpha =
    (kH * aH + kV * aV + (kH * aH - kV * aV) * cos2El * cos2Tau) / (2 * k);

  return { k, alpha };
}

/**
 * Atténuation spécifique γ_R (dB/km) = k · R^α.
 * @param rainRate taux de pluie R (mm/h)
 */
export function specificAttenuation(
  rainRate: number,
  freqGHz: number,
  pol: Polarization = 'circular',
  elevationDeg = 0,
  tiltDeg?: number,
): number {
  if (rainRate <= 0) return 0;
  const { k, alpha } = rainCoefficients(freqGHz, pol, elevationDeg, tiltDeg);
  return k * Math.pow(rainRate, alpha);
}
