import { describe, it, expect } from 'vitest';
import {
  fspl,
  gainFromHpbw,
  hpbwFromGain,
  eirp,
  computeCN0,
  requiredEirp,
  requiredPt,
  cn0ToCn,
} from './linkbudget';

describe('Bilan de liaison', () => {
  it('FSPL ~182.5 dB pour un lien type GPS (1.575 GHz, 20200 km)', () => {
    expect(fspl(20200, 1.575)).toBeCloseTo(182.5, 0);
  });

  it('FSPL : +20 dB par décade de distance et de fréquence', () => {
    const base = fspl(1000, 10);
    expect(fspl(10000, 10) - base).toBeCloseTo(20, 6);
    expect(fspl(1000, 100) - base).toBeCloseTo(20, 6);
  });

  it('gain ↔ HPBW sont inverses', () => {
    const g = gainFromHpbw(1, 0.6);
    expect(g).toBeCloseTo(42.1, 1);
    expect(hpbwFromGain(g, 0.6)).toBeCloseTo(1, 6);
  });

  it('faisceau étroit = gain plus élevé', () => {
    expect(gainFromHpbw(0.5)).toBeGreaterThan(gainFromHpbw(2));
  });

  it('EIRP = Pt + G − pertes', () => {
    expect(eirp(20, 40, 1)).toBe(59);
  });

  it('requiredEirp inverse computeCN0', () => {
    const params = {
      freqGHz: 12,
      slantRangeKm: 38000,
      gOverTdBK: 12,
      atmoLossDb: 0.5,
      rainAttenuationDb: 3,
      miscLossDb: 1,
    };
    const eirpDbw = 55;
    const { cn0DbHz } = computeCN0({ ...params, eirpDbw });
    const bandwidthHz = 36e6;
    const cnRequired = cn0ToCn(cn0DbHz, bandwidthHz);
    const got = requiredEirp({ ...params, cnRequiredDb: cnRequired, bandwidthHz });
    expect(got).toBeCloseTo(eirpDbw, 6);
  });

  it('requiredPt soustrait le gain de l’EIRP', () => {
    expect(requiredPt(55, 40, 1)).toBe(16);
  });
});
