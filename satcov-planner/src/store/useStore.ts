import { create } from 'zustand';
import type { ScenarioConfig } from '../core/scenario';
import { GEO_ALTITUDE } from '../core/constants';
import type { OrbitClass } from '../core/orbit';

export interface LayerToggles {
  footprint3dB: boolean;
  footprint43dB: boolean;
  rainHeatmap: boolean;
  groundTrack: boolean;
  spots: boolean;
}

export interface Playback {
  playing: boolean;
  speed: number; // multiplicateur temps réel
}

interface StoreState {
  cfg: ScenarioConfig;
  layers: LayerToggles;
  playback: Playback;
  setCfg: (patch: Partial<ScenarioConfig>) => void;
  setKeplerian: (patch: Partial<ScenarioConfig['keplerian']>) => void;
  setOrbitClass: (c: OrbitClass) => void;
  toggleLayer: (id: keyof LayerToggles) => void;
  setPlayback: (patch: Partial<Playback>) => void;
  setTime: (ms: number) => void;
  loadSettings: (data: { cfg?: Partial<ScenarioConfig>; layers?: Partial<LayerToggles> }) => void;
}

/** Sérialisation d'un réglage complet (export/import JSON). */
export interface SettingsFile {
  version: number;
  cfg: ScenarioConfig;
  layers: LayerToggles;
}

const now = Date.now();

/** Altitudes typiques par classe pour réinitialiser proprement. */
const CLASS_DEFAULTS: Record<OrbitClass, Partial<ScenarioConfig['keplerian']>> = {
  LEO: { altitudeKm: 550, inclinationDeg: 53 },
  MEO: { altitudeKm: 20200, inclinationDeg: 55 },
  GEO: { altitudeKm: GEO_ALTITUDE, inclinationDeg: 0, subLongitudeDeg: 10 },
};

const defaultConfig: ScenarioConfig = {
  orbitClass: 'GEO',
  orbitSource: 'keplerian',
  keplerian: {
    altitudeKm: GEO_ALTITUDE,
    inclinationDeg: 0,
    raanDeg: 0,
    eccentricity: 0,
    argPerigeeDeg: 0,
    meanAnomalyDeg: 0,
    subLongitudeDeg: 10,
  },
  epoch: now,
  time: now,

  band: 'Ku',
  direction: 'downlink',
  ptDbw: 17, // ~50 W
  hpbwDeg: 2,
  efficiency: 0.6,
  lineLossDb: 1,
  gOverTdBK: 12,
  cnRequiredDb: 8,
  bandwidthHz: 36e6,
  atmoLossDb: 0.5,
  miscLossDb: 1,

  minElevationDeg: 5,

  availabilityPct: 99.9,
  polarization: 'circular',
  rainSource: 'preset',
  rainPreset: 'temperate',
  r001Manual: 42,

  coverageHalfAngleDeg: 4,
  crossoverLevelDb: 4.3,
  colors: 4,
};

export const useStore = create<StoreState>((set) => ({
  cfg: defaultConfig,
  layers: {
    footprint3dB: true,
    footprint43dB: true,
    rainHeatmap: false,
    groundTrack: true,
    spots: false,
  },
  playback: { playing: false, speed: 60 },

  setCfg: (patch) => set((s) => ({ cfg: { ...s.cfg, ...patch } })),
  setKeplerian: (patch) =>
    set((s) => ({ cfg: { ...s.cfg, keplerian: { ...s.cfg.keplerian, ...patch } } })),
  setOrbitClass: (c) =>
    set((s) => ({
      cfg: {
        ...s.cfg,
        orbitClass: c,
        keplerian: { ...s.cfg.keplerian, ...CLASS_DEFAULTS[c] },
      },
    })),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),
  setTime: (ms) => set((s) => ({ cfg: { ...s.cfg, time: ms } })),
  loadSettings: (data) =>
    set((s) => ({
      cfg: data.cfg ? { ...s.cfg, ...data.cfg, keplerian: { ...s.cfg.keplerian, ...data.cfg.keplerian } } : s.cfg,
      layers: data.layers ? { ...s.layers, ...data.layers } : s.layers,
    })),
}));
