/**
 * Module 2 — Empreinte de projection au sol.
 *
 * On modélise le faisceau comme un cône (demi-angle = HPBW/2) depuis le
 * satellite et on ray-cast ses bords sur l'ellipsoïde WGS84. La projection
 * produit naturellement la déformation (cercle au nadir → ellipse allongée
 * vers le bord du disque visible). L'empreinte est limitée par l'angle de site
 * minimal exploitable.
 *
 * Repère : ECEF en km. Tous les vecteurs sont des triplets {x,y,z}.
 */

import { WGS84_A, WGS84_B, WGS84_E2, RAD2DEG, DEG2RAD } from './constants';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const normalize = (a: Vec3): Vec3 => scale(a, 1 / norm(a));
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Géodésique (lat,lon,h en °/°/km) → ECEF (km). */
export function geodeticToEcef(latDeg: number, lonDeg: number, hKm = 0): Vec3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const xy = (N + hKm) * Math.cos(lat);
  return {
    x: xy * Math.cos(lon),
    y: xy * Math.sin(lon),
    z: (N * (1 - WGS84_E2) + hKm) * sinLat,
  };
}

/** ECEF (km) → géodésique (lat,lon en °, h en km) — méthode de Bowring. */
export function ecefToGeodetic(p: Vec3): { latDeg: number; lonDeg: number; hKm: number } {
  const lon = Math.atan2(p.y, p.x);
  const r = Math.sqrt(p.x * p.x + p.y * p.y);
  const ep2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
  const theta = Math.atan2(p.z * WGS84_A, r * WGS84_B);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const lat = Math.atan2(
    p.z + ep2 * WGS84_B * sinT * sinT * sinT,
    r - WGS84_E2 * WGS84_A * cosT * cosT * cosT,
  );
  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const h = r / Math.cos(lat) - N;
  return { latDeg: lat * RAD2DEG, lonDeg: lon * RAD2DEG, hKm: h };
}

/** Normale ellipsoïdale (vers le haut local) au point géodésique. */
function ellipsoidNormal(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  return {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.cos(lat) * Math.sin(lon),
    z: Math.sin(lat),
  };
}

/**
 * Intersection rayon/ellipsoïde WGS84. Renvoie le point ECEF le plus proche
 * dans le sens du rayon, ou null si le rayon manque la Terre.
 */
export function rayEllipsoidIntersect(origin: Vec3, dir: Vec3): Vec3 | null {
  // Mise à l'échelle de l'espace pour transformer l'ellipsoïde en sphère unité.
  const ax = 1 / WGS84_A;
  const az = 1 / WGS84_B;
  const o = { x: origin.x * ax, y: origin.y * ax, z: origin.z * az };
  const d = { x: dir.x * ax, y: dir.y * ax, z: dir.z * az };
  const a = dot(d, d);
  const b = 2 * dot(o, d);
  const c = dot(o, o) - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  return add(origin, scale(dir, t));
}

/** Portée oblique (km) entre satellite et point sol. */
export function slantRange(satEcef: Vec3, groundEcef: Vec3): number {
  return norm(sub(satEcef, groundEcef));
}

/** Angle de site (°) du satellite vu depuis un point sol. */
export function elevationAngle(satEcef: Vec3, groundEcef: Vec3): number {
  const up = ellipsoidNormalFromEcef(groundEcef);
  const toSat = normalize(sub(satEcef, groundEcef));
  return Math.asin(Math.max(-1, Math.min(1, dot(up, toSat)))) * RAD2DEG;
}

function ellipsoidNormalFromEcef(p: Vec3): Vec3 {
  const g = ecefToGeodetic(p);
  return ellipsoidNormal(g.latDeg, g.lonDeg);
}

/**
 * Demi-angle (depuis le boresight) du contour à un niveau donné, selon le
 * modèle parabolique G(θ) ≈ 12·(θ/HPBW)² : θ = HPBW·√(niveau/12).
 * Niveau -3 dB → HPBW/2 ; -4.3 dB → ~0.6·HPBW.
 */
export function beamHalfAngleAtLevel(hpbwDeg: number, levelDb: number): number {
  return hpbwDeg * Math.sqrt(levelDb / 12);
}

export interface FootprintOptions {
  /** Position satellite ECEF (km). */
  satEcef: Vec3;
  /** Point visé au sol (lat/lon). Par défaut : sub-satellite (nadir). */
  aimLatDeg?: number;
  aimLonDeg?: number;
  /** Demi-angle du cône (°) — typiquement HPBW/2 pour le contour -3 dB. */
  coneHalfAngleDeg: number;
  /** Angle de site minimal exploitable (°). */
  minElevationDeg?: number;
  /** Nombre de points du polygone. */
  segments?: number;
}

export interface FootprintResult {
  /** Sommets du polygone (lat/lon en °). */
  ring: { latDeg: number; lonDeg: number }[];
  /** Vrai si l'empreinte a été rognée par l'horizon / l'angle de site min. */
  clipped: boolean;
  /** Portée oblique min/max sur le contour (km). */
  slantMinKm: number;
  slantMaxKm: number;
}

/**
 * Calcule le polygone d'empreinte d'un faisceau conique projeté sur WGS84.
 */
export function computeFootprint(opts: FootprintOptions): FootprintResult {
  const {
    satEcef,
    coneHalfAngleDeg,
    minElevationDeg = 5,
    segments = 128,
  } = opts;

  // Point visé : sub-satellite si non précisé.
  const satGeo = ecefToGeodetic(satEcef);
  const aimLat = opts.aimLatDeg ?? satGeo.latDeg;
  const aimLon = opts.aimLonDeg ?? satGeo.lonDeg;
  const aimEcef = geodeticToEcef(aimLat, aimLon, 0);

  const boresight = normalize(sub(aimEcef, satEcef));
  // Base orthonormale perpendiculaire au boresight.
  const ref: Vec3 = Math.abs(boresight.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(boresight, ref));
  const v = cross(boresight, u);

  const half = coneHalfAngleDeg * DEG2RAD;
  const ring: { latDeg: number; lonDeg: number }[] = [];
  let clipped = false;
  let slantMin = Infinity;
  let slantMax = 0;

  /** Rayon à l'azimut donné pour un demi-angle donné. */
  const rayAt = (azim: number, ang: number): Vec3 => {
    const radial = add(scale(u, Math.cos(azim)), scale(v, Math.sin(azim)));
    return normalize(add(scale(boresight, Math.cos(ang)), scale(radial, Math.sin(ang))));
  };

  /** Point sol valide (intersection + site >= min) pour un demi-angle, ou null. */
  const groundAt = (azim: number, ang: number): Vec3 | null => {
    const hit = rayEllipsoidIntersect(satEcef, rayAt(azim, ang));
    if (!hit) return null;
    if (elevationAngle(satEcef, hit) < minElevationDeg) return null;
    return hit;
  };

  for (let s = 0; s < segments; s++) {
    const azim = (2 * Math.PI * s) / segments;
    let pt = groundAt(azim, half);
    if (!pt) {
      // Rogné : on cherche par dichotomie le plus grand demi-angle valide.
      clipped = true;
      let lo = 0;
      let hi = half;
      let best: Vec3 | null = groundAt(azim, 0);
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        const p = groundAt(azim, mid);
        if (p) {
          best = p;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      pt = best;
    }
    if (!pt) continue;
    const g = ecefToGeodetic(pt);
    ring.push({ latDeg: g.latDeg, lonDeg: g.lonDeg });
    const sr = slantRange(satEcef, pt);
    slantMin = Math.min(slantMin, sr);
    slantMax = Math.max(slantMax, sr);
  }

  return {
    ring,
    clipped,
    slantMinKm: ring.length ? slantMin : 0,
    slantMaxKm: slantMax,
  };
}

/**
 * Projette le centre d'un spot, défini par un décalage angulaire (uDeg,vDeg)
 * par rapport au boresight pointant vers le point visé, sur le sol WGS84.
 * Renvoie lat/lon (°) ou null si le rayon manque la Terre / sous l'horizon.
 */
export function projectBeamCenter(
  satEcef: Vec3,
  aimLatDeg: number,
  aimLonDeg: number,
  uDeg: number,
  vDeg: number,
  minElevationDeg = 5,
): { latDeg: number; lonDeg: number } | null {
  const aimEcef = geodeticToEcef(aimLatDeg, aimLonDeg, 0);
  const boresight = normalize(sub(aimEcef, satEcef));
  const ref: Vec3 = Math.abs(boresight.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(boresight, ref));
  const v = cross(boresight, u);

  const offRad = Math.hypot(uDeg, vDeg) * DEG2RAD;
  if (offRad === 0) {
    const g0 = ecefToGeodetic(aimEcef);
    return { latDeg: g0.latDeg, lonDeg: g0.lonDeg };
  }
  const azim = Math.atan2(vDeg, uDeg);
  const radial = add(scale(u, Math.cos(azim)), scale(v, Math.sin(azim)));
  const dir = normalize(add(scale(boresight, Math.cos(offRad)), scale(radial, Math.sin(offRad))));
  const hit = rayEllipsoidIntersect(satEcef, dir);
  if (!hit) return null;
  if (elevationAngle(satEcef, hit) < minElevationDeg) return null;
  const g = ecefToGeodetic(hit);
  return { latDeg: g.latDeg, lonDeg: g.lonDeg };
}

/**
 * Demi-angle de couverture maximal du disque visible (°) depuis le satellite,
 * pour un angle de site minimal donné — borne supérieure de la HPBW utile.
 */
export function maxVisibleHalfAngle(
  altitudeKm: number,
  minElevationDeg = 5,
): number {
  // Géométrie sphérique : angle au satellite (nadir) du point à l'angle de site.
  const Re = WGS84_A;
  const rs = Re + altitudeKm;
  const el = minElevationDeg * DEG2RAD;
  // Loi des sinus : sin(nadir)/Re = cos(el)/rs.
  const sinNadir = (Re * Math.cos(el)) / rs;
  return Math.asin(Math.max(-1, Math.min(1, sinNadir))) * RAD2DEG;
}
