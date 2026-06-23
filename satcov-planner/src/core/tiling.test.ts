import { describe, it, expect } from 'vitest';
import { planTiling } from './tiling';

describe('Pavage (faisceau unique vs spots)', () => {
  it('faisceau unique quand la zone tient dans la HPBW max', () => {
    const r = planTiling({ coverageHalfAngleDeg: 1, maxHpbwDeg: 4 });
    expect(r.verdict).toBe('single');
    expect(r.nSpots).toBe(1);
    expect(r.spotHpbwDeg).toBeCloseTo(2, 6);
  });

  it('pavage multi-spots quand la zone dépasse la HPBW max', () => {
    const r = planTiling({ coverageHalfAngleDeg: 5, maxHpbwDeg: 0.5 });
    expect(r.verdict).toBe('multi');
    expect(r.nSpots).toBeGreaterThan(10);
  });

  it('plus la HPBW max est petite, plus il faut de spots', () => {
    const coarse = planTiling({ coverageHalfAngleDeg: 5, maxHpbwDeg: 1 });
    const fine = planTiling({ coverageHalfAngleDeg: 5, maxHpbwDeg: 0.4 });
    expect(fine.nSpots).toBeGreaterThan(coarse.nSpots);
  });

  it('affecte un nombre de couleurs cohérent', () => {
    const r3 = planTiling({ coverageHalfAngleDeg: 5, maxHpbwDeg: 0.5, colors: 3 });
    const colors = new Set(r3.cells.map((c) => c.color));
    expect(colors.size).toBeLessThanOrEqual(3);
    expect(colors.size).toBeGreaterThan(1);
  });

  it('gain par spot plus élevé qu’un faisceau unique large', () => {
    const single = planTiling({ coverageHalfAngleDeg: 5, maxHpbwDeg: 12 });
    const multi = planTiling({ coverageHalfAngleDeg: 5, maxHpbwDeg: 0.5 });
    expect(multi.spotGainDbi).toBeGreaterThan(single.spotGainDbi);
  });
});
