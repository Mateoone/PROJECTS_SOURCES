/**
 * Cerveau de calcul — combine tous les modules en un résultat dérivé pur,
 * consommé indifféremment par l'UI React et le rendu Cesium.
 *
 * Aucune dépendance à Cesium ni React : 100 % testable.
 */

import {
  propagateKeplerian,
  propagateTleAt,
  geoState,
  type KeplerianElements,
  type OrbitClass,
  type OrbitState,
  groundTrack,
  orbitalPeriodSec,
} from './orbit';
import {
  computeFootprint,
  beamHalfAngleAtLevel,
  geodeticToEcef,
  slantRange,
  ecefToGeodetic,
  elevationAngle,
  projectBeamCenter,
  type Vec3,
  type FootprintResult,
} from './geometry';
import {
  fspl,
  gainFromHpbw,
  eirp,
  computeCN0,
  requiredEirp,
  requiredPt,
  cn0ToCn,
  dishDiameterFromHpbw,
} from './linkbudget';
import { rainMarginForAvailability } from './itu/p618';
import { rainfallRate001, RAIN_PRESETS } from './itu/p837';
import type { Polarization } from './itu/p838';
import { planTiling, type TilingResult } from './tiling';
import { RAD2DEG } from './constants';

export type LinkDirection = 'downlink' | 'uplink';

export interface BandPreset {
  id: string;
  label: string;
  downlinkGHz: number;
  uplinkGHz: number;
}

export const BANDS: Record<string, BandPreset> = {
  C: { id: 'C', label: 'Bande C', downlinkGHz: 4, uplinkGHz: 6 },
  Ku: { id: 'Ku', label: 'Bande Ku', downlinkGHz: 12, uplinkGHz: 14 },
  Ka: { id: 'Ka', label: 'Bande Ka', downlinkGHz: 20, uplinkGHz: 30 },
};

export interface ScenarioConfig {
  // --- Orbite ---
  orbitClass: OrbitClass;
  orbitSource: 'keplerian' | 'tle';
  keplerian: KeplerianElements;
  tle?: { line1: string; line2: string; name?: string };
  epoch: number; // ms
  time: number; // ms (instant courant)

  // --- RF ---
  band: string;
  direction: LinkDirection;
  ptDbw: number; // puissance d'émission
  hpbwDeg: number; // largeur de faisceau -3 dB
  efficiency: number; // rendement antenne
  lineLossDb: number;
  gOverTdBK: number;
  cnRequiredDb: number;
  bandwidthHz: number;
  atmoLossDb: number;
  miscLossDb: number;

  // --- Empreinte ---
  minElevationDeg: number;
  aimLatDeg?: number;
  aimLonDeg?: number;

  // --- Pluie ---
  availabilityPct: number;
  polarization: Polarization;
  rainSource: 'manual' | 'preset' | 'auto';
  rainPreset: string;
  r001Manual: number;

  // --- Pavage ---
  coverageHalfAngleDeg: number;
  crossoverLevelDb: number;
  colors: 3 | 4;
}

export interface ScenarioResult {
  orbit: OrbitState;
  satEcef: Vec3;
  frequencyGHz: number;
  /** Contour -3 dB. */
  footprint3dB: FootprintResult;
  /** Contour -4.3 dB (croisement entre spots). */
  footprint43dB: FootprintResult;
  gainDbi: number;
  eirpDbw: number;
  dishDiameterM: number;
  /** Portée oblique au bord de couverture (km). */
  edgeSlantKm: number;
  edgeFsplDb: number;
  /** Marge de pluie requise au bord (dB). */
  rainMarginDb: number;
  r001: number;
  /** C/N au bord de couverture avec la puissance saisie (dB). */
  edgeCnDb: number;
  /** Marge sur l'objectif C/N requis (dB) : >0 = lien tenable. */
  linkMarginDb: number;
  /** EIRP nécessaire au bord pour tenir le C/N requis (dB). */
  requiredEirpDbw: number;
  /** Pt nécessaire pour l'antenne actuelle (dBW). */
  requiredPtDbw: number;
  /** HPBW max admissible (déduite de l'EIRP requis à Pt fixée). */
  maxHpbwDeg: number;
  tiling: TilingResult;
  /** Trace au sol pour les orbites non-GEO. */
  groundTrack: { latDeg: number; lonDeg: number }[];
  /** Échantillons de marge pluie sur l'empreinte (heatmap). */
  rainSamples: { latDeg: number; lonDeg: number; marginDb: number }[];
  /** Empreintes déformées de chaque spot (pavage), pour le rendu. */
  spotFootprints: SpotFootprint[];
  /** Point de visée effectif (nadir si non steeré). */
  aimLatDeg: number;
  aimLonDeg: number;
  /** Angle de site réel au point de visé (°). */
  aimElevationDeg: number;
}

export interface SpotFootprint {
  color: number;
  ring: { latDeg: number; lonDeg: number }[];
}

/** Résout R_0.01 (mm/h) selon la source choisie. */
export function resolveR001(cfg: ScenarioConfig, latDeg: number, lonDeg: number): number {
  if (cfg.rainSource === 'manual') return cfg.r001Manual;
  if (cfg.rainSource === 'preset') return RAIN_PRESETS[cfg.rainPreset]?.r001 ?? 42;
  return rainfallRate001(latDeg, lonDeg);
}

/** Propage l'orbite à l'instant courant. */
export function propagateScenario(cfg: ScenarioConfig, atMs?: number): OrbitState {
  const date = new Date(atMs ?? cfg.time);
  if (cfg.orbitSource === 'tle' && cfg.tle) {
    return propagateTleAt(cfg.tle.line1, cfg.tle.line2, date);
  }
  if (cfg.orbitClass === 'GEO' && cfg.keplerian.subLongitudeDeg !== undefined) {
    return geoState(cfg.keplerian.subLongitudeDeg);
  }
  return propagateKeplerian(cfg.keplerian, date, new Date(cfg.epoch));
}

/** Calcule l'ensemble du scénario à l'instant courant. */
export function evaluateScenario(cfg: ScenarioConfig): ScenarioResult {
  const orbit = propagateScenario(cfg);
  const satEcef = orbit.ecef;
  const band = BANDS[cfg.band] ?? BANDS.Ku;
  const frequencyGHz = cfg.direction === 'uplink' ? band.uplinkGHz : band.downlinkGHz;

  // Point de visée effectif : nadir (sub-satellite) si non steeré.
  const aimLatDeg = cfg.aimLatDeg ?? orbit.latDeg;
  const aimLonDeg = cfg.aimLonDeg ?? orbit.lonDeg;
  const aimEcef = geodeticToEcef(aimLatDeg, aimLonDeg);
  const aimElevationDeg = elevationAngle(satEcef, aimEcef);

  // Empreintes -3 dB et -4.3 dB (ray-cast → déformation oblique automatique).
  const footprint3dB = computeFootprint({
    satEcef,
    aimLatDeg,
    aimLonDeg,
    coneHalfAngleDeg: beamHalfAngleAtLevel(cfg.hpbwDeg, 3),
    minElevationDeg: cfg.minElevationDeg,
  });
  const footprint43dB = computeFootprint({
    satEcef,
    aimLatDeg,
    aimLonDeg,
    coneHalfAngleDeg: beamHalfAngleAtLevel(cfg.hpbwDeg, 4.3),
    minElevationDeg: cfg.minElevationDeg,
  });

  // Bilan de liaison au bord de couverture.
  const gainDbi = gainFromHpbw(cfg.hpbwDeg, cfg.efficiency);
  const eirpDbw = eirp(cfg.ptDbw, gainDbi, cfg.lineLossDb);
  const dishDiameterM = dishDiameterFromHpbw(cfg.hpbwDeg, frequencyGHz);
  const edgeSlantKm = footprint3dB.slantMaxKm || slantRange(satEcef, geodeticToEcef(orbit.latDeg, orbit.lonDeg));
  const edgeFsplDb = fspl(edgeSlantKm, frequencyGHz);

  // Marge de pluie au point de visée, avec son angle de site RÉEL (un GEO
  // pointant la Suède voit un site faible → trajet pluie long → marge élevée).
  const r001 = resolveR001(cfg, aimLatDeg, aimLonDeg);
  const rainMarginDb = rainMarginForAvailability(
    {
      freqGHz: frequencyGHz,
      elevationDeg: Math.max(aimElevationDeg, 2),
      latDeg: aimLatDeg,
      lonDeg: aimLonDeg,
      r001,
      pol: cfg.polarization,
    },
    cfg.availabilityPct,
  );

  const lossParams = {
    freqGHz: frequencyGHz,
    slantRangeKm: edgeSlantKm,
    gOverTdBK: cfg.gOverTdBK,
    atmoLossDb: cfg.atmoLossDb,
    rainAttenuationDb: rainMarginDb,
    miscLossDb: cfg.miscLossDb,
  };
  const { cn0DbHz } = computeCN0({ ...lossParams, eirpDbw });
  const edgeCnDb = cn0ToCn(cn0DbHz, cfg.bandwidthHz);
  const linkMarginDb = edgeCnDb - cfg.cnRequiredDb;

  const requiredEirpDbw = requiredEirp({
    ...lossParams,
    cnRequiredDb: cfg.cnRequiredDb,
    bandwidthHz: cfg.bandwidthHz,
  });
  const requiredPtDbw = requiredPt(requiredEirpDbw, gainDbi, cfg.lineLossDb);

  // HPBW max admissible : à Pt fixée, l'EIRP dispo = ptDbw + G(HPBW) - lineLoss.
  // On cherche la plus grande HPBW telle que EIRP(HPBW) >= requiredEirp.
  // EIRP requis dépend peu de la HPBW (via slant range) → approx : gain requis.
  const requiredGainDbi = requiredEirpDbw - cfg.ptDbw + cfg.lineLossDb;
  const maxHpbwDeg = Math.sqrt((cfg.efficiency * 27000) / Math.pow(10, requiredGainDbi / 10));

  const tiling = planTiling({
    coverageHalfAngleDeg: cfg.coverageHalfAngleDeg,
    maxHpbwDeg: Math.max(0.05, maxHpbwDeg),
    efficiency: cfg.efficiency,
    crossoverLevelDb: cfg.crossoverLevelDb,
    colors: cfg.colors,
  });

  // Trace au sol (orbites mobiles uniquement).
  const isMoving = !(cfg.orbitClass === 'GEO');
  const track = isMoving
    ? groundTrack(
        (d) => propagateScenario(cfg, d.getTime()),
        new Date(cfg.time),
        orbitalPeriodSec(cfg.keplerian.altitudeKm),
        120,
      )
    : [];

  // Heatmap pluie : échantillonnage de la marge sur l'empreinte.
  const rainSamples = sampleRainMargin(cfg, footprint3dB, frequencyGHz, satEcef);

  // Empreintes déformées des spots (chaque spot ray-casté individuellement).
  const spotFootprints =
    tiling.verdict === 'multi'
      ? computeSpotFootprints(satEcef, aimLatDeg, aimLonDeg, tiling, cfg.minElevationDeg)
      : [];

  return {
    orbit,
    satEcef,
    frequencyGHz,
    footprint3dB,
    footprint43dB,
    gainDbi,
    eirpDbw,
    dishDiameterM,
    edgeSlantKm,
    edgeFsplDb,
    rainMarginDb,
    r001,
    edgeCnDb,
    linkMarginDb,
    requiredEirpDbw,
    requiredPtDbw,
    maxHpbwDeg,
    tiling,
    groundTrack: track,
    rainSamples,
    spotFootprints,
    aimLatDeg,
    aimLonDeg,
    aimElevationDeg,
  };
}

/**
 * Empreinte déformée de chaque spot du pavage. Chaque spot est ray-casté
 * individuellement autour de sa propre direction de visée → la déformation
 * oblique (ellipses de plus en plus allongées vers le bord) est traitée comme
 * pour l'empreinte principale. Le nombre de spots rendus est plafonné pour
 * rester fluide ; au-delà, on sous-échantillonne.
 */
function computeSpotFootprints(
  satEcef: Vec3,
  aimLatDeg: number,
  aimLonDeg: number,
  tiling: TilingResult,
  minElevationDeg: number,
  cap = 160,
): SpotFootprint[] {
  const cells = tiling.cells;
  const coneHalf = beamHalfAngleAtLevel(tiling.spotHpbwDeg, 3);
  const step = cells.length > cap ? Math.ceil(cells.length / cap) : 1;
  const out: SpotFootprint[] = [];
  for (let i = 0; i < cells.length; i += step) {
    const cell = cells[i];
    const center = projectBeamCenter(satEcef, aimLatDeg, aimLonDeg, cell.uDeg, cell.vDeg, minElevationDeg);
    if (!center) continue;
    const fp = computeFootprint({
      satEcef,
      aimLatDeg: center.latDeg,
      aimLonDeg: center.lonDeg,
      coneHalfAngleDeg: coneHalf,
      minElevationDeg,
      segments: 28,
    });
    if (fp.ring.length >= 3) out.push({ color: cell.color, ring: fp.ring });
  }
  return out;
}

/** Échantillonne la marge de pluie sur une grille couvrant l'empreinte. */
function sampleRainMargin(
  cfg: ScenarioConfig,
  fp: FootprintResult,
  freqGHz: number,
  satEcef: Vec3,
): { latDeg: number; lonDeg: number; marginDb: number }[] {
  if (fp.ring.length < 3) return [];
  const lats = fp.ring.map((p) => p.latDeg);
  const lons = fp.ring.map((p) => p.lonDeg);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const samples: { latDeg: number; lonDeg: number; marginDb: number }[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const lat = minLat + ((maxLat - minLat) * i) / N;
      const lon = minLon + ((maxLon - minLon) * j) / N;
      if (!pointInRing(lat, lon, fp.ring)) continue;
      const groundEcef = geodeticToEcef(lat, lon);
      const el = elevationToSat(satEcef, groundEcef);
      if (el < cfg.minElevationDeg) continue;
      const r001 = resolveR001(cfg, lat, lon);
      const marginDb = rainMarginForAvailability(
        { freqGHz, elevationDeg: el, latDeg: lat, lonDeg: lon, r001, pol: cfg.polarization },
        cfg.availabilityPct,
      );
      samples.push({ latDeg: lat, lonDeg: lon, marginDb });
    }
  }
  return samples;
}

function elevationToSat(satEcef: Vec3, groundEcef: Vec3): number {
  const g = ecefToGeodetic(groundEcef);
  const up = {
    x: Math.cos((g.latDeg * Math.PI) / 180) * Math.cos((g.lonDeg * Math.PI) / 180),
    y: Math.cos((g.latDeg * Math.PI) / 180) * Math.sin((g.lonDeg * Math.PI) / 180),
    z: Math.sin((g.latDeg * Math.PI) / 180),
  };
  const d = { x: satEcef.x - groundEcef.x, y: satEcef.y - groundEcef.y, z: satEcef.z - groundEcef.z };
  const dn = Math.hypot(d.x, d.y, d.z);
  const dotv = (up.x * d.x + up.y * d.y + up.z * d.z) / dn;
  return Math.asin(Math.max(-1, Math.min(1, dotv))) * RAD2DEG;
}

/** Test point-dans-polygone (ray casting) en lat/lon. */
function pointInRing(lat: number, lon: number, ring: { latDeg: number; lonDeg: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lonDeg;
    const yi = ring[i].latDeg;
    const xj = ring[j].lonDeg;
    const yj = ring[j].latDeg;
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
