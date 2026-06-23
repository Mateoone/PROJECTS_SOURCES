import { describe, it, expect } from 'vitest';
import {
  geodeticToEcef,
  ecefToGeodetic,
  slantRange,
  elevationAngle,
  computeFootprint,
  maxVisibleHalfAngle,
  rayEllipsoidIntersect,
  beamHalfAngleAtLevel,
} from './geometry';
import { GEO_ALTITUDE, WGS84_A } from './constants';

const geoSat = geodeticToEcef(0, 0, GEO_ALTITUDE);

describe('Géométrie d’empreinte', () => {
  it('geodetic ↔ ecef sont inverses', () => {
    const p = geodeticToEcef(48.85, 2.35, 0.1);
    const g = ecefToGeodetic(p);
    expect(g.latDeg).toBeCloseTo(48.85, 4);
    expect(g.lonDeg).toBeCloseTo(2.35, 4);
    expect(g.hKm).toBeCloseTo(0.1, 3);
  });

  it('portée nadir GEO ≈ 35786 km', () => {
    const sub = geodeticToEcef(0, 0, 0);
    expect(slantRange(geoSat, sub)).toBeCloseTo(GEO_ALTITUDE, 0);
  });

  it('site = 90° au point sub-satellite', () => {
    const sub = geodeticToEcef(0, 0, 0);
    expect(elevationAngle(geoSat, sub)).toBeCloseTo(90, 2);
  });

  it('rayon nadir intersecte la Terre au sub-satellite', () => {
    const dir = { x: -1, y: 0, z: 0 }; // de GEO(0,0) vers le centre
    const hit = rayEllipsoidIntersect(geoSat, dir);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(WGS84_A, 0);
  });

  it('rayon qui manque la Terre renvoie null', () => {
    const dir = { x: 0, y: 0, z: 1 }; // vers le pôle, parallèle, manque
    expect(rayEllipsoidIntersect(geoSat, dir)).toBeNull();
  });

  it('demi-angle visible depuis GEO ≈ 8.7°', () => {
    expect(maxVisibleHalfAngle(GEO_ALTITUDE, 0)).toBeCloseTo(8.7, 1);
  });

  it('contour -3 dB = HPBW/2, -4.3 dB plus large', () => {
    expect(beamHalfAngleAtLevel(2, 3)).toBeCloseTo(1, 6);
    expect(beamHalfAngleAtLevel(2, 4.3)).toBeGreaterThan(1);
  });

  it('empreinte GEO nadir : anneau centré sur le sub-satellite', () => {
    const fp = computeFootprint({
      satEcef: geoSat,
      coneHalfAngleDeg: 1,
      minElevationDeg: 5,
      segments: 64,
    });
    expect(fp.ring.length).toBeGreaterThan(10);
    const meanLat = fp.ring.reduce((s, p) => s + p.latDeg, 0) / fp.ring.length;
    const meanLon = fp.ring.reduce((s, p) => s + p.lonDeg, 0) / fp.ring.length;
    expect(meanLat).toBeCloseTo(0, 1);
    expect(meanLon).toBeCloseTo(0, 1);
    expect(fp.clipped).toBe(false);
  });

  it('empreinte steeré hors nadir : centrée sur la cible, pas sur le sub-satellite', () => {
    const fp = computeFootprint({
      satEcef: geoSat,
      aimLatDeg: 63, // Suède
      aimLonDeg: 16,
      coneHalfAngleDeg: 1,
      minElevationDeg: 5,
      segments: 64,
    });
    expect(fp.ring.length).toBeGreaterThan(10);
    const meanLat = fp.ring.reduce((s, p) => s + p.latDeg, 0) / fp.ring.length;
    const meanLon = fp.ring.reduce((s, p) => s + p.lonDeg, 0) / fp.ring.length;
    expect(meanLat).toBeGreaterThan(55); // bien au nord, pas à l'équateur
    // Centroïde proche de la cible en longitude (l'ellipse oblique est
    // asymétrique → tolérance large), et clairement pas au sub-satellite (0°).
    expect(meanLon).toBeGreaterThan(8);
    expect(meanLon).toBeLessThan(28);
  });

  it('déformation : empreinte oblique plus allongée en latitude qu’au nadir', () => {
    const span = (ring: { latDeg: number; lonDeg: number }[]) => {
      const lats = ring.map((p) => p.latDeg);
      return Math.max(...lats) - Math.min(...lats);
    };
    const nadir = computeFootprint({ satEcef: geoSat, coneHalfAngleDeg: 1, segments: 64 });
    const oblique = computeFootprint({
      satEcef: geoSat,
      aimLatDeg: 63,
      aimLonDeg: 16,
      coneHalfAngleDeg: 1,
      segments: 64,
    });
    // À demi-angle égal, l'empreinte oblique (site faible) est nettement
    // plus étendue radialement que l'empreinte au nadir.
    expect(span(oblique.ring)).toBeGreaterThan(span(nadir.ring) * 1.5);
  });

  it('empreinte large rognée par l’horizon (clipped)', () => {
    const fp = computeFootprint({
      satEcef: geoSat,
      coneHalfAngleDeg: 12, // > demi-angle visible ~8.7°
      minElevationDeg: 5,
      segments: 64,
    });
    expect(fp.clipped).toBe(true);
  });
});
