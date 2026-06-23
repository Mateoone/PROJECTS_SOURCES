import type { ScenarioResult } from '../core/scenario';
import { dbwToWatt } from '../core/linkbudget';
import { Section } from './ui';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </>
  );
}

export default function Readout({ res }: { res: ScenarioResult }) {
  const link = res.linkMarginDb >= 0;
  const t = res.tiling;
  return (
    <>
      <Section title="Lecture directe">
        <div className="readout">
          <Row k="Sub-satellite" v={`${res.orbit.latDeg.toFixed(1)}°, ${res.orbit.lonDeg.toFixed(1)}°`} />
          <Row k="Visée" v={`${res.aimLatDeg.toFixed(1)}°, ${res.aimLonDeg.toFixed(1)}°`} />
          <Row k="Site au point visé" v={`${res.aimElevationDeg.toFixed(1)}°`} />
          <Row k="Altitude" v={`${res.orbit.altitudeKm.toFixed(0)} km`} />
          <Row k="Fréquence" v={`${res.frequencyGHz.toFixed(1)} GHz`} />
          <Row k="Gain antenne" v={`${res.gainDbi.toFixed(1)} dBi`} />
          <Row k="Ø antenne ≈" v={`${res.dishDiameterM.toFixed(2)} m`} />
          <Row k="EIRP" v={`${res.eirpDbw.toFixed(1)} dBW`} />
          <Row k="Portée bord" v={`${res.edgeSlantKm.toFixed(0)} km`} />
          <Row k="FSPL bord" v={`${res.edgeFsplDb.toFixed(1)} dB`} />
          <Row k="R₀.₀₁" v={`${res.r001.toFixed(0)} mm/h`} />
          <Row k="Marge pluie req." v={`${res.rainMarginDb.toFixed(1)} dB`} />
          <Row k="C/N au bord" v={`${res.edgeCnDb.toFixed(1)} dB`} />
        </div>
      </Section>

      <Section title="Bilan de liaison (bord de couverture)">
        <div className="readout">
          <Row k="Marge liaison" v={`${res.linkMarginDb >= 0 ? '+' : ''}${res.linkMarginDb.toFixed(1)} dB`} />
          <Row k="EIRP nécessaire" v={`${res.requiredEirpDbw.toFixed(1)} dBW`} />
          <Row k="Pt nécessaire" v={`${res.requiredPtDbw.toFixed(1)} dBW (${dbwToWatt(res.requiredPtDbw).toFixed(0)} W)`} />
          <Row k="HPBW max admissible" v={`${res.maxHpbwDeg.toFixed(2)}°`} />
        </div>
        <div className={`verdict ${link ? 'single' : 'multi'}`}>
          {link
            ? `✓ Lien tenable à ${'99.9'}% — marge +${res.linkMarginDb.toFixed(1)} dB`
            : `✗ Lien NON tenable — déficit ${res.linkMarginDb.toFixed(1)} dB`}
        </div>
      </Section>

      <Section title="Verdict pavage">
        <div className={`verdict ${t.verdict}`}>
          {t.verdict === 'single'
            ? `Faisceau unique — HPBW ${t.spotHpbwDeg.toFixed(1)}°, gain ${t.spotGainDbi.toFixed(1)} dBi`
            : `Multi-spots — ${t.nSpots} cellules × HPBW ${t.spotHpbwDeg.toFixed(2)}°`}
        </div>
        {t.verdict === 'multi' && (
          <div className="readout" style={{ marginTop: 8 }}>
            <Row k="Spots" v={`${t.nSpots}`} />
            <Row k="Gain/spot" v={`${t.spotGainDbi.toFixed(1)} dBi`} />
            <Row k="Réutilisation" v={`${t.colors} couleurs`} />
            <Row k="EIRP total ≈" v={`${(res.eirpDbw + 10 * Math.log10(Math.max(1, t.nSpots))).toFixed(1)} dBW`} />
          </div>
        )}
        <div className="hint">
          {res.aimElevationDeg < 0
            ? '⚠︎ Cible sous l’horizon (non visible depuis le satellite).'
            : res.footprint3dB.clipped
              ? '⚠︎ Empreinte rognée par l’horizon.'
              : 'Empreinte entièrement visible.'}
        </div>
      </Section>
    </>
  );
}
