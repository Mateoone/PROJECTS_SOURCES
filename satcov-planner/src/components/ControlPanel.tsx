import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { SettingsFile } from '../store/useStore';
import { Section, Slider, Segmented, NumberField, Toggle } from './ui';
import { BANDS } from '../core/scenario';
import { RAIN_PRESETS } from '../core/itu/p837';
import { propagateTleAt } from '../core/orbit';
import type { OrbitClass } from '../core/orbit';

/** Cibles de visée rapides (lat, lon). */
const AIM_PRESETS = [
  { label: 'Suède', lat: 63, lon: 16 },
  { label: 'Paris', lat: 48.9, lon: 2.35 },
  { label: 'Équateur', lat: 0, lon: 10 },
];

export default function ControlPanel() {
  const cfg = useStore((s) => s.cfg);
  const layers = useStore((s) => s.layers);
  const setCfg = useStore((s) => s.setCfg);
  const setKeplerian = useStore((s) => s.setKeplerian);
  const setOrbitClass = useStore((s) => s.setOrbitClass);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const loadSettings = useStore((s) => s.loadSettings);

  // Texte TLE brut en état LOCAL : le textarea reflète la frappe en temps réel,
  // et on ne commite cfg.tle que lorsque 2 lignes valides sont présentes.
  const [tleText, setTleText] = useState(
    cfg.tle ? `${cfg.tle.line1}\n${cfg.tle.line2}` : '',
  );
  useEffect(() => {
    // Resynchronise si cfg.tle change de l'extérieur (import JSON).
    setTleText(cfg.tle ? `${cfg.tle.line1}\n${cfg.tle.line2}` : '');
  }, [cfg.tle]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportSettings = () => {
    const { cfg: c, layers: l } = useStore.getState();
    const data: SettingsFile = { version: 1, cfg: c, layers: l };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `satcov-setting-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || !parsed.cfg?.orbitClass) {
          alert('Fichier de réglage invalide.');
          return;
        }
        loadSettings({ cfg: parsed.cfg, layers: parsed.layers });
      } catch {
        alert('Impossible de lire le JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      {/* ---------- ORBITE ---------- */}
      <Section title="Module 1 · Orbite">
        <Segmented<OrbitClass>
          value={cfg.orbitClass}
          options={[
            { value: 'LEO', label: 'LEO' },
            { value: 'MEO', label: 'MEO' },
            { value: 'GEO', label: 'GEO' },
          ]}
          onChange={setOrbitClass}
        />
        <div style={{ height: 8 }} />
        <Segmented<'keplerian' | 'tle'>
          value={cfg.orbitSource}
          options={[
            { value: 'keplerian', label: 'Éléments' },
            { value: 'tle', label: 'TLE' },
          ]}
          onChange={(v) => setCfg({ orbitSource: v })}
        />

        {cfg.orbitSource === 'keplerian' ? (
          <div style={{ marginTop: 8 }}>
            {cfg.orbitClass === 'GEO' ? (
              <Slider
                label="Longitude sub-satellite"
                value={cfg.keplerian.subLongitudeDeg ?? 0}
                min={-180}
                max={180}
                unit="°"
                onChange={(v) => setKeplerian({ subLongitudeDeg: v })}
              />
            ) : (
              <>
                <Slider
                  label="Altitude"
                  value={cfg.keplerian.altitudeKm}
                  min={cfg.orbitClass === 'LEO' ? 400 : 8000}
                  max={cfg.orbitClass === 'LEO' ? 2000 : 25000}
                  step={10}
                  unit=" km"
                  onChange={(v) => setKeplerian({ altitudeKm: v })}
                />
                <Slider
                  label="Inclinaison"
                  value={cfg.keplerian.inclinationDeg}
                  min={0}
                  max={110}
                  unit="°"
                  onChange={(v) => setKeplerian({ inclinationDeg: v })}
                />
                <Slider
                  label="RAAN (Ω)"
                  value={cfg.keplerian.raanDeg}
                  min={0}
                  max={360}
                  unit="°"
                  onChange={(v) => setKeplerian({ raanDeg: v })}
                />
                <Slider
                  label="Anomalie moyenne"
                  value={cfg.keplerian.meanAnomalyDeg ?? 0}
                  min={0}
                  max={360}
                  unit="°"
                  onChange={(v) => setKeplerian({ meanAnomalyDeg: v })}
                />
              </>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <textarea
              rows={3}
              placeholder="Collez les 2 lignes du TLE…"
              value={tleText}
              onChange={(e) => {
                const raw = e.target.value;
                setTleText(raw);
                const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
                const [l1, l2] = lines.length >= 2 ? lines.slice(-2) : ['', ''];
                if (l1 && l2) {
                  try {
                    propagateTleAt(l1, l2, new Date());
                    setCfg({ tle: { line1: l1, line2: l2 } });
                  } catch {
                    /* TLE incomplet/invalide : on garde la frappe, sans commit */
                  }
                }
              }}
            />
            <div className="hint">
              {cfg.tle ? '✓ TLE valide chargé.' : 'SGP4/SDP4 via satellite.js. Source : Celestrak.'}
            </div>
          </div>
        )}
      </Section>

      {/* ---------- POINTAGE / VISÉE ---------- */}
      <Section title="Module 2 · Pointage de la visée">
        <Segmented<'nadir' | 'custom'>
          value={cfg.aimLatDeg === undefined ? 'nadir' : 'custom'}
          options={[
            { value: 'nadir', label: 'Nadir' },
            { value: 'custom', label: 'Cible (lat/lon)' },
          ]}
          onChange={(v) =>
            v === 'nadir'
              ? setCfg({ aimLatDeg: undefined, aimLonDeg: undefined })
              : setCfg({ aimLatDeg: 63, aimLonDeg: 16 })
          }
        />
        {cfg.aimLatDeg !== undefined && (
          <div style={{ marginTop: 8 }}>
            <Slider
              label="Latitude visée"
              value={cfg.aimLatDeg}
              min={-85}
              max={85}
              fixed={1}
              unit="°"
              onChange={(v) => setCfg({ aimLatDeg: v })}
            />
            <Slider
              label="Longitude visée"
              value={cfg.aimLonDeg ?? 0}
              min={-180}
              max={180}
              fixed={1}
              unit="°"
              onChange={(v) => setCfg({ aimLonDeg: v })}
            />
            <div className="seg" style={{ marginTop: 4 }}>
              {AIM_PRESETS.map((p) => (
                <button key={p.label} onClick={() => setCfg({ aimLatDeg: p.lat, aimLonDeg: p.lon })}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="hint">
              Steering hors nadir : l’empreinte s’allonge (site oblique) — déformation traitée par ray-cast.
            </div>
          </div>
        )}
      </Section>

      {/* ---------- BANDE & PUISSANCE ---------- */}
      <Section title="Module 3 · Bande & puissance">
        <Segmented
          value={cfg.band}
          options={Object.values(BANDS).map((b) => ({ value: b.id, label: b.id }))}
          onChange={(v) => setCfg({ band: v })}
        />
        <div style={{ height: 8 }} />
        <Segmented<'downlink' | 'uplink'>
          value={cfg.direction}
          options={[
            { value: 'downlink', label: 'Descendant' },
            { value: 'uplink', label: 'Montant' },
          ]}
          onChange={(v) => setCfg({ direction: v })}
        />
        <div style={{ height: 8 }} />
        <Slider
          label="Puissance émise Pt"
          value={cfg.ptDbw}
          min={-10}
          max={40}
          unit=" dBW"
          onChange={(v) => setCfg({ ptDbw: v })}
        />
        <Slider
          label="HPBW (faisceau -3 dB)"
          value={cfg.hpbwDeg}
          min={0.1}
          max={12}
          step={0.1}
          fixed={1}
          unit="°"
          onChange={(v) => setCfg({ hpbwDeg: v })}
        />
        <Slider
          label="Rendement antenne η"
          value={cfg.efficiency}
          min={0.4}
          max={0.75}
          step={0.01}
          fixed={2}
          onChange={(v) => setCfg({ efficiency: v })}
        />
        <div className="row">
          <NumberField label="G/T (dB/K)" value={cfg.gOverTdBK} step={0.5} onChange={(v) => setCfg({ gOverTdBK: v })} />
          <NumberField label="C/N requis (dB)" value={cfg.cnRequiredDb} step={0.5} onChange={(v) => setCfg({ cnRequiredDb: v })} />
        </div>
        <Slider
          label="Largeur de bande"
          value={cfg.bandwidthHz / 1e6}
          min={1}
          max={500}
          step={1}
          unit=" MHz"
          onChange={(v) => setCfg({ bandwidthHz: v * 1e6 })}
        />
      </Section>

      {/* ---------- PLUIE ---------- */}
      <Section title="Module 4 · Pluie & disponibilité">
        <Slider
          label="Disponibilité cible"
          value={cfg.availabilityPct}
          min={99}
          max={99.99}
          step={0.01}
          fixed={2}
          unit=" %"
          onChange={(v) => setCfg({ availabilityPct: v })}
        />
        <div className="field">
          <label><span>Polarisation</span></label>
          <Segmented
            value={cfg.polarization}
            options={[
              { value: 'H', label: 'H' },
              { value: 'V', label: 'V' },
              { value: 'circular', label: 'Circ.' },
            ]}
            onChange={(v) => setCfg({ polarization: v as typeof cfg.polarization })}
          />
        </div>
        <div className="field">
          <label><span>Source R₀.₀₁</span></label>
          <Segmented
            value={cfg.rainSource}
            options={[
              { value: 'preset', label: 'Climat' },
              { value: 'manual', label: 'Manuel' },
              { value: 'auto', label: 'Auto (lat)' },
            ]}
            onChange={(v) => setCfg({ rainSource: v as typeof cfg.rainSource })}
          />
        </div>
        {cfg.rainSource === 'preset' && (
          <select value={cfg.rainPreset} onChange={(e) => setCfg({ rainPreset: e.target.value })}>
            {Object.entries(RAIN_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label} — {p.r001} mm/h
              </option>
            ))}
          </select>
        )}
        {cfg.rainSource === 'manual' && (
          <Slider
            label="R₀.₀₁"
            value={cfg.r001Manual}
            min={0}
            max={180}
            unit=" mm/h"
            onChange={(v) => setCfg({ r001Manual: v })}
          />
        )}
        <div className="hint">
          ITU-R P.838 (k,α) · P.618 (atténuation trajet) · P.839 (hauteur pluie).
        </div>
      </Section>

      {/* ---------- PAVAGE ---------- */}
      <Section title="Module 5 · Pavage">
        <Slider
          label="Demi-angle zone à couvrir"
          value={cfg.coverageHalfAngleDeg}
          min={0.5}
          max={9}
          step={0.1}
          fixed={1}
          unit="°"
          onChange={(v) => setCfg({ coverageHalfAngleDeg: v })}
        />
        <div className="field">
          <label><span>Réutilisation fréquence</span></label>
          <Segmented
            value={String(cfg.colors)}
            options={[
              { value: '3', label: '3 couleurs' },
              { value: '4', label: '4 couleurs' },
            ]}
            onChange={(v) => setCfg({ colors: Number(v) as 3 | 4 })}
          />
        </div>
        <Slider
          label="Niveau de croisement spots"
          value={cfg.crossoverLevelDb}
          min={3}
          max={6}
          step={0.1}
          fixed={1}
          unit=" dB"
          onChange={(v) => setCfg({ crossoverLevelDb: v })}
        />
      </Section>

      {/* ---------- COUCHES ---------- */}
      <Section title="Affichage">
        <Slider
          label="Angle de site minimal"
          value={cfg.minElevationDeg}
          min={0}
          max={30}
          unit="°"
          onChange={(v) => setCfg({ minElevationDeg: v })}
        />
        <Toggle label="Empreinte -3 dB" checked={layers.footprint3dB} onChange={() => toggleLayer('footprint3dB')} />
        <Toggle label="Contour -4.3 dB" checked={layers.footprint43dB} onChange={() => toggleLayer('footprint43dB')} />
        <Toggle label="Heatmap marge pluie" checked={layers.rainHeatmap} onChange={() => toggleLayer('rainHeatmap')} />
        <Toggle label="Trace au sol" checked={layers.groundTrack} onChange={() => toggleLayer('groundTrack')} />
        <Toggle label="Spots (pavage)" checked={layers.spots} onChange={() => toggleLayer('spots')} />
      </Section>

      {/* ---------- RÉGLAGES (EXPORT / IMPORT JSON) ---------- */}
      <Section title="Réglages">
        <div className="row">
          <button className="btn" onClick={exportSettings}>⤓ Exporter JSON</button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>⤒ Importer JSON</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importSettings(f);
            e.target.value = ''; // permet de réimporter le même fichier
          }}
        />
        <div className="hint">
          Sauvegarde l’intégralité du scénario (orbite, visée, bande, puissance, pluie, pavage, couches).
        </div>
      </Section>
    </>
  );
}
