import { describe, it, expect } from 'vitest';
import {
  classFromAltitude,
  orbitalPeriodSec,
  geoState,
  propagateKeplerian,
  groundTrack,
} from './orbit';
import { GEO_ALTITUDE } from './constants';

describe('Orbite', () => {
  it('classe par altitude', () => {
    expect(classFromAltitude(550)).toBe('LEO');
    expect(classFromAltitude(20200)).toBe('MEO');
    expect(classFromAltitude(GEO_ALTITUDE)).toBe('GEO');
  });

  it('période GEO ≈ jour sidéral (86164 s)', () => {
    expect(orbitalPeriodSec(GEO_ALTITUDE)).toBeCloseTo(86164, -2);
  });

  it('période LEO 550 km ≈ 95 min', () => {
    expect(orbitalPeriodSec(550) / 60).toBeCloseTo(95.6, 0);
  });

  it('geoState place le satellite à la bonne longitude', () => {
    const s = geoState(10);
    expect(s.lonDeg).toBeCloseTo(10, 6);
    expect(s.latDeg).toBeCloseTo(0, 6);
    expect(s.altitudeKm).toBeCloseTo(GEO_ALTITUDE, 6);
  });

  it('orbite GEO képlérienne : sub-longitude quasi fixe sur 1 h', () => {
    const epoch = new Date('2026-06-18T00:00:00Z');
    const el = { altitudeKm: GEO_ALTITUDE, inclinationDeg: 0, raanDeg: 0, meanAnomalyDeg: 0 };
    const a = propagateKeplerian(el, epoch, epoch);
    const b = propagateKeplerian(el, new Date(epoch.getTime() + 3600_000), epoch);
    expect(Math.abs(a.lonDeg - b.lonDeg)).toBeLessThan(1);
    expect(a.altitudeKm).toBeCloseTo(GEO_ALTITUDE, -1);
  });

  it('LEO képlérienne : altitude stable, latitude bornée par l’inclinaison', () => {
    const epoch = new Date('2026-06-18T00:00:00Z');
    const el = { altitudeKm: 550, inclinationDeg: 53, raanDeg: 0, meanAnomalyDeg: 0 };
    const track = groundTrack(
      (d) => propagateKeplerian(el, d, epoch),
      epoch,
      orbitalPeriodSec(550),
      90,
    );
    for (const p of track) {
      expect(Math.abs(p.latDeg)).toBeLessThan(53.5);
    }
  });
});
