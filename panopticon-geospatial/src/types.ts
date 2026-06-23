/** Types partagés Panopticon. */

export type LayerId = 'sats' | 'air' | 'sis' | 'cctv';
export type RenderMode = 'normal' | 'nvg';
export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'SSO';

/** TLE brut tel que renvoyé par le proxy /api/tle. */
export interface TleRecord {
  name: string;
  l1: string;
  l2: string;
  noradId: string;
  group: string;
}

export interface TleResponse {
  sats: TleRecord[];
  count: number;
  okGroups: number;
}

/** Métadonnées satellite calculées une fois côté worker. */
export interface SatMeta {
  index: number;
  noradId: string;
  name: string;
  group: string;
  inclination: number; // degrés
  periodMin: number; // minutes
  apogeeKm: number;
  perigeeKm: number;
  orbitClass: OrbitClass;
}

/** Position instantanée d'un satellite (issue du worker). */
export interface SatState {
  lat: number;
  lon: number;
  altKm: number;
  speedKmS: number;
}

export interface Aircraft {
  icao24: string;
  callsign: string;
  origin: string;
  lon: number;
  lat: number;
  baroAlt: number | null;
  velocity: number | null;
  heading: number | null;
  geoAlt: number | null;
}

export interface Earthquake {
  id: string;
  place: string;
  mag: number;
  time: number;
  tsunami: number;
  url: string;
  lon: number;
  lat: number;
  depth: number;
}

export interface Webcam {
  id: string;
  title: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
  preview?: string;
  day?: string;
  stream?: string;
}

/** Élément actuellement sélectionné dans le HUD. */
export type Selection =
  | { kind: 'sat'; meta: SatMeta; state: SatState; tle: { name: string; l1: string; l2: string } | null }
  | { kind: 'air'; data: Aircraft }
  | { kind: 'sis'; data: Earthquake }
  | { kind: 'cctv'; data: Webcam }
  | null;

/* ---- Protocole de messages du Web Worker ---- */
export type WorkerInbound =
  | { type: 'init'; tle: TleRecord[] }
  | { type: 'orbit'; index: number };

export type WorkerOutbound =
  | { type: 'ready'; meta: SatMeta[] }
  | { type: 'positions'; buffer: ArrayBuffer; count: number; time: number }
  | { type: 'orbit'; index: number; points: number[] }; // [lon,lat,altMeters,...]
