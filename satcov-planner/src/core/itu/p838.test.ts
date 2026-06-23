import { describe, it, expect } from 'vitest';
import { rainCoefficients, specificAttenuation } from './p838';

/**
 * Les valeurs tabulées de P.838-3 sont elles-mêmes générées à partir des
 * coefficients de régression que nous implémentons : on doit donc retrouver
 * les valeurs publiées avec une bonne précision.
 */
describe('P.838-3 — coefficients k/α', () => {
  it('reproduit k_H/α_H à 10 GHz (valeur de référence)', () => {
    const { k, alpha } = rainCoefficients(10, 'H', 0);
    expect(k).toBeCloseTo(0.01217, 4);
    expect(alpha).toBeCloseTo(1.2571, 3);
  });

  it('reproduit k_V/α_V à 10 GHz', () => {
    const { k, alpha } = rainCoefficients(10, 'V', 0);
    expect(k).toBeCloseTo(0.01129, 4);
    expect(alpha).toBeCloseTo(1.2156, 3);
  });

  it('k croît avec la fréquence (C < Ku < Ka)', () => {
    const kC = rainCoefficients(6, 'H', 0).k;
    const kKu = rainCoefficients(12, 'H', 0).k;
    const kKa = rainCoefficients(20, 'H', 0).k;
    expect(kC).toBeLessThan(kKu);
    expect(kKu).toBeLessThan(kKa);
  });

  it('polarisation circulaire = moyenne H/V à site nul', () => {
    const h = rainCoefficients(20, 'H', 0);
    const v = rainCoefficients(20, 'V', 0);
    const c = rainCoefficients(20, 'circular', 0);
    expect(c.k).toBeCloseTo((h.k + v.k) / 2, 5);
  });

  it('γ_R = k·R^α est croissant avec le taux de pluie', () => {
    const a = specificAttenuation(10, 20, 'circular');
    const b = specificAttenuation(50, 20, 'circular');
    expect(b).toBeGreaterThan(a);
    expect(specificAttenuation(0, 20)).toBe(0);
  });
});
