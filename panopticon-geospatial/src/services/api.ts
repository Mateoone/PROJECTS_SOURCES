/** Client HTTP vers le proxy Express + cache IndexedDB pour les TLE. */
import type { TleResponse, Aircraft, Earthquake, Webcam } from '../types';
import { idbGet, idbSet } from './indexedDb';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

/** TLE : on tente le cache IndexedDB (2 h) avant l'appel réseau. */
export async function fetchTle(): Promise<TleResponse> {
  const cached = await idbGet<TleResponse>('tle');
  if (cached && cached.count > 0) return cached;
  const data = await getJson<TleResponse>('/api/tle');
  if (data.count > 0) await idbSet('tle', data);
  return data;
}

export async function fetchAircraft(bbox?: {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}): Promise<{ states: Aircraft[]; count: number; degraded?: boolean; stale?: boolean }> {
  const q = bbox
    ? `?lamin=${bbox.lamin.toFixed(3)}&lomin=${bbox.lomin.toFixed(3)}&lamax=${bbox.lamax.toFixed(3)}&lomax=${bbox.lomax.toFixed(3)}`
    : '';
  return getJson(`/api/aircraft${q}`);
}

export async function fetchEarthquakes(): Promise<{
  quakes: Earthquake[];
  count: number;
  degraded?: boolean;
}> {
  return getJson('/api/earthquakes');
}

export async function fetchWebcams(center?: {
  lat: number;
  lon: number;
  radius: number;
}): Promise<{ webcams: Webcam[]; count: number; source: string }> {
  const q = center
    ? `?lat=${center.lat.toFixed(3)}&lon=${center.lon.toFixed(3)}&radius=${center.radius}`
    : '';
  return getJson(`/api/webcams${q}`);
}

export async function fetchAircraftPhoto(icao24: string): Promise<{
  icao24: string;
  photo: { thumbnail: string; link: string; photographer: string } | null;
}> {
  return getJson(`/api/aircraft-photo?icao24=${encodeURIComponent(icao24)}`);
}

export interface SatelliteInfo {
  norad: string;
  satcat: {
    name: string;
    intlDes: string;
    type: string;
    status: string;
    owner: string;
    launchDate: string | null;
    launchSite: string | null;
    decayDate: string | null;
    rcs: string | null;
  } | null;
  wiki: { title: string; extract: string; image: string | null; url: string } | null;
  image: string | null;
}

export async function fetchSatelliteInfo(
  norad: string,
  name: string,
  group: string,
): Promise<SatelliteInfo> {
  return getJson(
    `/api/satellite-info?norad=${encodeURIComponent(norad)}&name=${encodeURIComponent(name)}&group=${encodeURIComponent(group)}`,
  );
}

export async function fetchHealth(): Promise<{
  status: string;
  uptime: number;
  satellites: number;
  tleGroups: number;
}> {
  return getJson('/api/health');
}
