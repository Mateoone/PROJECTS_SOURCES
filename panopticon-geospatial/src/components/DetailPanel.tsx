import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { globeApi } from '../services/globeApi';
import { audio } from '../services/audioService';
import TelemetryFeed from './TelemetryFeed';
import SatelliteInfo from './SatelliteInfo';
import AircraftPhoto from './AircraftPhoto';
import type { SatState, Webcam } from '../types';

/** Photo de webcam rafraîchie périodiquement (cache-buster) — feed « live ». */
function LiveCam({ webcam }: { webcam: Webcam }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const raw = webcam.preview || webcam.day;
  if (!raw) return <TelemetryFeed label={webcam.title} lat={webcam.lat} lon={webcam.lon} />;
  const src = `${raw}${raw.includes('?') ? '&' : '?'}cb=${tick}`;
  return (
    <div className="relative">
      <img
        src={src}
        alt={webcam.title}
        className="w-full rounded-sm border border-hud-emerald/30 bg-black"
      />
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[9px] text-hud-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-hud-danger animate-pulse" /> LIVE
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-baseline border-b border-hud-emerald/10 py-1">
      <span className="hud-label">{label}</span>
      <span className={`text-xs font-medium ${accent ?? 'text-hud-emerald'}`}>{value}</span>
    </div>
  );
}

export default function DetailPanel() {
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const [live, setLive] = useState<SatState | null>(null);

  // Rafraîchit la télémétrie live du satellite sélectionné (~3 Hz).
  useEffect(() => {
    if (selection?.kind !== 'sat') {
      setLive(null);
      return;
    }
    const idx = selection.meta.index;
    const id = setInterval(() => setLive(globeApi.getSatState(idx)), 300);
    return () => clearInterval(id);
  }, [selection]);

  if (!selection) return null;

  return (
    <div className="absolute right-3 top-16 z-20 w-80 hud-panel p-3 max-h-[calc(100%-5rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs tracking-[0.2em] text-hud-emerald glow-text">
          ◎ TÉLÉMÉTRIE CIBLE
        </span>
        <button
          onClick={() => {
            setSelection(null);
            audio.blip();
          }}
          className="text-hud-emerald/50 hover:text-hud-danger text-xs"
        >
          ✕
        </button>
      </div>

      {selection.kind === 'sat' && (
        <>
          <div className="text-sm text-hud-emerald font-bold mb-2 truncate">
            {selection.meta.name}
          </div>
          <SatelliteInfo
            norad={selection.meta.noradId}
            name={selection.meta.name}
            group={selection.meta.group}
            lat={live?.lat ?? selection.state.lat}
            lon={live?.lon ?? selection.state.lon}
            tle={selection.tle ?? null}
          />
          <div className="mt-3">
            <Row label="NORAD ID" value={selection.meta.noradId} />
            <Row label="CLASSE ORBITE" value={selection.meta.orbitClass} accent="text-hud-amber" />
            <Row label="GROUPE" value={selection.meta.group} />
            <Row label="INCLINAISON" value={`${selection.meta.inclination.toFixed(2)}°`} />
            <Row label="PÉRIODE" value={`${selection.meta.periodMin.toFixed(1)} min`} />
            <Row label="APOGÉE" value={`${selection.meta.apogeeKm.toFixed(0)} km`} />
            <Row label="PÉRIGÉE" value={`${selection.meta.perigeeKm.toFixed(0)} km`} />
            <Row
              label="ALTITUDE"
              value={`${(live?.altKm ?? selection.state.altKm).toFixed(1)} km`}
              accent="text-hud-sky"
            />
            <Row
              label="VITESSE REL."
              value={`${(live?.speedKmS ?? selection.state.speedKmS).toFixed(2)} km/s`}
              accent="text-hud-sky"
            />
            <Row
              label="POSITION"
              value={`${(live?.lat ?? selection.state.lat).toFixed(2)}, ${(live?.lon ?? selection.state.lon).toFixed(2)}`}
            />
          </div>
          <button
            onClick={() => {
              globeApi.focusSat(selection.meta.index);
              audio.sweep();
            }}
            className="hud-btn w-full mt-3 border-hud-emerald/50 text-hud-emerald hover:bg-hud-emerald/15"
          >
            ⟲ ALIGNEMENT CAMÉRA ORBITALE
          </button>
        </>
      )}

      {selection.kind === 'air' && (
        <>
          <div className="text-sm text-hud-sky font-bold mb-2">
            ✈ {selection.data.callsign || selection.data.icao24}
          </div>
          <AircraftPhoto
            icao24={selection.data.icao24}
            label={selection.data.callsign || selection.data.icao24}
            lat={selection.data.lat}
            lon={selection.data.lon}
          />
          <div className="mt-3">
            <Row label="ICAO24" value={selection.data.icao24} />
            <Row label="ORIGINE" value={selection.data.origin || '—'} />
            <Row label="ALTITUDE" value={`${((selection.data.geoAlt ?? selection.data.baroAlt ?? 0)).toFixed(0)} m`} accent="text-hud-sky" />
            <Row label="VITESSE" value={`${(selection.data.velocity ?? 0).toFixed(0)} m/s`} />
            <Row label="CAP" value={`${(selection.data.heading ?? 0).toFixed(0)}°`} />
            <Row label="POSITION" value={`${selection.data.lat.toFixed(2)}, ${selection.data.lon.toFixed(2)}`} />
          </div>
        </>
      )}

      {selection.kind === 'sis' && (
        <>
          <div className={`text-sm font-bold mb-2 ${selection.data.mag >= 6 ? 'text-hud-danger' : 'text-hud-amber'}`}>
            ◬ MAGNITUDE {selection.data.mag?.toFixed(1)}
          </div>
          <div className="mt-1">
            <Row label="LIEU" value={selection.data.place || '—'} />
            <Row label="MAGNITUDE" value={selection.data.mag?.toFixed(1)} accent={selection.data.mag >= 6 ? 'text-hud-danger' : 'text-hud-amber'} />
            <Row label="PROFONDEUR" value={`${selection.data.depth?.toFixed(1)} km`} />
            <Row label="TSUNAMI" value={selection.data.tsunami ? 'ALERTE' : 'NON'} accent={selection.data.tsunami ? 'text-hud-danger' : undefined} />
            <Row label="HEURE" value={new Date(selection.data.time).toLocaleTimeString('fr-FR')} />
            <Row label="POSITION" value={`${selection.data.lat.toFixed(2)}, ${selection.data.lon.toFixed(2)}`} />
          </div>
          <button
            onClick={() => {
              globeApi.flyTo(selection.data.lon, selection.data.lat, 4_000_000);
              audio.sweep();
            }}
            className="hud-btn w-full mt-3 border-hud-emerald/50 text-hud-emerald hover:bg-hud-emerald/15"
          >
            ⟲ CENTRER LA CAMÉRA
          </button>
          <a
            href={selection.data.url}
            target="_blank"
            rel="noreferrer"
            className="hud-btn block text-center w-full mt-2 border-hud-amber/50 text-hud-amber hover:bg-hud-amber/15"
          >
            ↗ RAPPORT USGS
          </a>
        </>
      )}

      {selection.kind === 'cctv' && (
        <>
          <div className="text-sm text-hud-amber font-bold mb-2 truncate">
            ▦ {selection.data.title}
          </div>
          <LiveCam webcam={selection.data} />
          <div className="mt-3">
            <Row label="VILLE" value={selection.data.city || '—'} />
            <Row label="PAYS" value={selection.data.country || '—'} />
            <Row label="POSITION" value={`${selection.data.lat.toFixed(2)}, ${selection.data.lon.toFixed(2)}`} />
          </div>
          <button
            onClick={() => {
              globeApi.flyTo(selection.data.lon, selection.data.lat, 1_200_000);
              audio.sweep();
            }}
            className="hud-btn w-full mt-3 border-hud-emerald/50 text-hud-emerald hover:bg-hud-emerald/15"
          >
            ⟲ CENTRER LA CAMÉRA
          </button>
          {selection.data.stream && (
            <a
              href={selection.data.stream}
              target="_blank"
              rel="noreferrer"
              className="hud-btn block text-center w-full mt-3 border-hud-amber/50 text-hud-amber hover:bg-hud-amber/15"
            >
              ▶ FLUX VIDÉO EN DIRECT
            </a>
          )}
        </>
      )}
    </div>
  );
}
