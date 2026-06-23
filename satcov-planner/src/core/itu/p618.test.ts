import { describe, it, expect } from 'vitest';
import {
  rainAttenuation001,
  rainAttenuationForPercent,
  rainMarginForAvailability,
} from './p618';

describe('P.618-13 — atténuation de trajet par la pluie', () => {
  const base = {
    freqGHz: 20,
    elevationDeg: 30,
    latDeg: 45,
    hsKm: 0,
    r001: 42,
    pol: 'circular' as const,
  };

  it('produit une atténuation positive et plausible en Ka-band', () => {
    const { a001, gammaR, effectivePathKm } = rainAttenuation001(base);
    expect(a001).toBeGreaterThan(0);
    expect(gammaR).toBeGreaterThan(0);
    expect(effectivePathKm).toBeGreaterThan(0);
    // Ordre de grandeur attendu : ~10–40 dB pour Ka, pluie modérée, 30° site.
    expect(a001).toBeGreaterThan(5);
    expect(a001).toBeLessThan(60);
  });

  it("croît avec la fréquence (C < Ku < Ka)", () => {
    const c = rainAttenuation001({ ...base, freqGHz: 6 }).a001;
    const ku = rainAttenuation001({ ...base, freqGHz: 12 }).a001;
    const ka = rainAttenuation001({ ...base, freqGHz: 20 }).a001;
    expect(c).toBeLessThan(ku);
    expect(ku).toBeLessThan(ka);
  });

  it('décroît quand l’angle de site augmente (trajet plus court)', () => {
    const low = rainAttenuation001({ ...base, elevationDeg: 10 }).a001;
    const high = rainAttenuation001({ ...base, elevationDeg: 60 }).a001;
    expect(low).toBeGreaterThan(high);
  });

  it('croît avec le taux de pluie R_0.01', () => {
    const dry = rainAttenuation001({ ...base, r001: 10 }).a001;
    const wet = rainAttenuation001({ ...base, r001: 100 }).a001;
    expect(wet).toBeGreaterThan(dry);
  });

  it('A_p décroît quand le pourcentage de temps p augmente', () => {
    const p001 = rainAttenuationForPercent(base, 0.01);
    const p01 = rainAttenuationForPercent(base, 0.1);
    const p1 = rainAttenuationForPercent(base, 1);
    expect(p001).toBeGreaterThan(p01);
    expect(p01).toBeGreaterThan(p1);
  });

  it('A_0.01 cohérent entre les deux points d’entrée', () => {
    const direct = rainAttenuation001(base).a001;
    const viaPercent = rainAttenuationForPercent(base, 0.01);
    expect(viaPercent).toBeCloseTo(direct, 6);
  });

  it('marge pour 99.99 % > marge pour 99.9 %', () => {
    const m999 = rainMarginForAvailability(base, 99.9);
    const m9999 = rainMarginForAvailability(base, 99.99);
    expect(m9999).toBeGreaterThan(m999);
  });

  it('pas d’atténuation si la station est au-dessus de la hauteur de pluie', () => {
    const { a001 } = rainAttenuation001({ ...base, hsKm: 10, hrKm: 4 });
    expect(a001).toBe(0);
  });
});
