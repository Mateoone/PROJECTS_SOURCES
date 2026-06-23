/**
 * Module 1 — Définition / propagation d'orbite.
 *
 * Deux sources :
 *  - éléments képlériens saisis (LEO/MEO/GEO) → propagation deux-corps analytique
 *  - TLE importé → SGP4/SDP4 via satellite.js
 *
 * Sortie commune : position ECEF (km), altitude, point sub-satellite (lat/lon).
 */

import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  eciToGeodetic,
  type EciVec3,
} from 'satellite.js';
import { GEO_ALTITUDE, RAD2DEG, WGS84_A } from './constants';

/** Constante gravitationnelle géocentrique (km³/s²). */
const MU_EARTH = 398600.4418;
const DEG2RAD = Math.PI / 180;

export type OrbitClass = 'LEO' | 'MEO' | 'GEO';

export interface KeplerianElements {
  /** Altitude au-dessus de la surface (km) — pour orbite circulaire. */
  altitudeKm: number;
  /** Inclinaison (°). */
  inclinationDeg: number;
  /** Ascension droite du nœud ascendant Ω (°). */
  raanDeg: number;
  /** Excentricité (0 = circulaire). */
  eccentricity?: number;
  /** Argument du périgée ω (°). */
  argPerigeeDeg?: number;
  /** Anomalie moyenne à l'époque M0 (°). */
  meanAnomalyDeg?: number;
  /** Pour GEO : longitude sub-satellite fixe (°). */
  subLongitudeDeg?: number;
}

export interface OrbitState {
  /** Position ECEF (km). */
  ecef: { x: number; y: number; z: number };
  /** Altitude au-dessus de l'ellipsoïde (km). */
  altitudeKm: number;
  /** Point sub-satellite. */
  latDeg: number;
  lonDeg: number;
}

export function classFromAltitude(altitudeKm: number): OrbitClass {
  if (altitudeKm >= 30000) return 'GEO';
  if (altitudeKm >= 7000) return 'MEO';
  return 'LEO';
}

/** Demi-grand axe (km) d'une orbite circulaire à l'altitude donnée. */
export function semiMajorAxis(altitudeKm: number): number {
  return WGS84_A + altitudeKm;
}

/** Période orbitale (s). */
export function orbitalPeriodSec(altitudeKm: number): number {
  const a = semiMajorAxis(altitudeKm);
  return 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
}

/** Résout l'équation de Kepler M = E − e·sinE par Newton-Raphson. */
function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Propage des éléments képlériens à l'instant `date` (deux-corps).
 * @param epoch instant de référence des éléments (M0)
 */
export function propagateKeplerian(
  el: KeplerianElements,
  date: Date,
  epoch: Date,
): OrbitState {
  const a = semiMajorAxis(el.altitudeKm);
  const e = el.eccentricity ?? 0;
  const i = el.inclinationDeg * DEG2RAD;
  const Omega = el.raanDeg * DEG2RAD;
  const omega = (el.argPerigeeDeg ?? 0) * DEG2RAD;
  const M0 = (el.meanAnomalyDeg ?? 0) * DEG2RAD;

  const n = Math.sqrt(MU_EARTH / (a * a * a)); // rad/s
  const dt = (date.getTime() - epoch.getTime()) / 1000;
  const M = M0 + n * dt;
  const E = solveKepler(M, e);

  // Anomalie vraie et rayon.
  const nu =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2),
    );
  const r = a * (1 - e * Math.cos(E));

  // Position dans le plan périfocal.
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);

  // Rotation périfocal → ECI (3-1-3 : ω, i, Ω).
  const cosO = Math.cos(Omega);
  const sinO = Math.sin(Omega);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);

  const eci: EciVec3<number> = {
    x:
      (cosO * cosw - sinO * sinw * cosi) * xp +
      (-cosO * sinw - sinO * cosw * cosi) * yp,
    y:
      (sinO * cosw + cosO * sinw * cosi) * xp +
      (-sinO * sinw + cosO * cosw * cosi) * yp,
    z: sinw * sini * xp + cosw * sini * yp,
  };

  const gmst = gstime(date);
  const geo = eciToGeodetic(eci, gmst);
  const ecf = eciToEcf(eci, gmst);

  return {
    ecef: { x: ecf.x, y: ecf.y, z: ecf.z },
    altitudeKm: geo.height,
    latDeg: geo.latitude * RAD2DEG,
    lonDeg: geo.longitude * RAD2DEG,
  };
}

/**
 * Construit un état GEO fixe à une longitude sub-satellite donnée.
 * (Cas particulier : inclinaison ≈ 0, l'orbite paraît immobile.)
 */
export function geoState(subLonDeg: number): OrbitState {
  const r = WGS84_A + GEO_ALTITUDE;
  const lon = subLonDeg * DEG2RAD;
  return {
    ecef: { x: r * Math.cos(lon), y: r * Math.sin(lon), z: 0 },
    altitudeKm: GEO_ALTITUDE,
    latDeg: 0,
    lonDeg: subLonDeg,
  };
}

/** Propage un TLE (SGP4/SDP4) à l'instant donné. */
export function propagateTleAt(line1: string, line2: string, date: Date): OrbitState {
  const satrec = twoline2satrec(line1, line2);
  const pv = propagate(satrec, date);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) {
    throw new Error('Échec de propagation SGP4');
  }
  const gmst = gstime(date);
  const geo = eciToGeodetic(pv.position as EciVec3<number>, gmst);
  const ecf = eciToEcf(pv.position as EciVec3<number>, gmst);
  return {
    ecef: { x: ecf.x, y: ecf.y, z: ecf.z },
    altitudeKm: geo.height,
    latDeg: geo.latitude * RAD2DEG,
    lonDeg: geo.longitude * RAD2DEG,
  };
}

/**
 * Échantillonne la trace au sol (ground track) sur une fenêtre temporelle.
 * @param sampler fonction date → état orbital
 * @param start instant de départ
 * @param durationSec durée de la fenêtre (s)
 * @param steps nombre d'échantillons
 */
export function groundTrack(
  sampler: (date: Date) => OrbitState,
  start: Date,
  durationSec: number,
  steps = 180,
): { latDeg: number; lonDeg: number }[] {
  const out: { latDeg: number; lonDeg: number }[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = new Date(start.getTime() + (durationSec * 1000 * s) / steps);
    const st = sampler(t);
    out.push({ latDeg: st.latDeg, lonDeg: st.lonDeg });
  }
  return out;
}
