/// <reference lib="webworker" />
/**
 * Moteur de propagation orbitale (SGP4) — exécuté hors du thread UI.
 *
 * - À l'init : parse les TLE, dérive les métadonnées (incl., période,
 *   apogée/périgée, classe orbitale) et démarre une boucle à 10 Hz.
 * - À chaque tick : propage TOUS les satellites et renvoie un Float32Array
 *   transférable [lon, lat, altMètres] x N (zéro copie, zéro GC côté UI).
 * - Sur demande 'orbit' : trace une révolution complète d'un satellite.
 */
import * as satellite from 'satellite.js';
import type {
  WorkerInbound,
  WorkerOutbound,
  SatMeta,
  TleRecord,
  OrbitClass,
} from '../types';

const MU = 398600.4418; // km^3/s^2
const RE = 6378.137; // rayon équatorial terrestre (km)
const TICK_MS = 100; // 10 Hz

let satrecs: satellite.SatRec[] = [];
let metas: SatMeta[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function classify(
  periodMin: number,
  meanAltKm: number,
  ecc: number,
  inclDeg: number,
): OrbitClass {
  if (ecc > 0.25) return 'HEO';
  // Héliosynchrone : LEO quasi-polaire rétrograde (~96°–102°).
  if (meanAltKm < 2000 && inclDeg >= 96 && inclDeg <= 102) return 'SSO';
  if (periodMin >= 1410 && periodMin <= 1460) return 'GEO';
  if (meanAltKm >= 35000) return 'GEO';
  if (meanAltKm >= 2000) return 'MEO';
  return 'LEO';
}

function buildMeta(rec: satellite.SatRec, tle: TleRecord, index: number): SatMeta {
  const noRadPerMin = rec.no; // mean motion (rad/min)
  const noRadPerSec = noRadPerMin / 60;
  const a = Math.cbrt(MU / (noRadPerSec * noRadPerSec)); // demi-grand axe (km)
  const ecc = rec.ecco;
  const apogeeKm = a * (1 + ecc) - RE;
  const perigeeKm = a * (1 - ecc) - RE;
  const periodMin = (2 * Math.PI) / noRadPerMin;
  const meanAltKm = (apogeeKm + perigeeKm) / 2;
  const inclDeg = (rec.inclo * 180) / Math.PI;
  return {
    index,
    noradId: tle.noradId,
    name: tle.name,
    group: tle.group,
    inclination: inclDeg,
    periodMin,
    apogeeKm,
    perigeeKm,
    orbitClass: classify(periodMin, meanAltKm, ecc, inclDeg),
  };
}

function init(tle: TleRecord[]) {
  satrecs = [];
  metas = [];
  let idx = 0;
  for (const t of tle) {
    try {
      const rec = satellite.twoline2satrec(t.l1, t.l2);
      if (rec.error !== 0 || !isFinite(rec.no) || rec.no <= 0) continue;
      metas.push(buildMeta(rec, t, idx));
      satrecs.push(rec);
      idx += 1;
    } catch {
      /* TLE corrompu : on l'ignore */
    }
  }
  post({ type: 'ready', meta: metas });
  startLoop();
}

function startLoop() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, TICK_MS);
  tick();
}

function tick() {
  const n = satrecs.length;
  // Stride 4 : [lon, lat, altMètres, vitesseKmS] par satellite.
  const buf = new Float32Array(n * 4);
  const now = new Date();
  const gmst = satellite.gstime(now);
  for (let i = 0; i < n; i++) {
    const pv = satellite.propagate(satrecs[i], now);
    const p = pv.position;
    if (!p || typeof p === 'boolean') {
      buf[i * 4] = NaN;
      continue;
    }
    const geo = satellite.eciToGeodetic(p, gmst);
    buf[i * 4] = satellite.degreesLong(geo.longitude);
    buf[i * 4 + 1] = satellite.degreesLat(geo.latitude);
    buf[i * 4 + 2] = geo.height * 1000; // km -> m
    const v = pv.velocity;
    buf[i * 4 + 3] =
      v && typeof v !== 'boolean' ? Math.hypot(v.x, v.y, v.z) : 0;
  }
  post(
    { type: 'positions', buffer: buf.buffer, count: n, time: now.getTime() },
    [buf.buffer],
  );
}

/**
 * Trace la trajectoire des dernières 24 h (rétrograde depuis maintenant).
 * Pas adaptatif : ~120 points/révolution, plafonné à 2000 points.
 */
function orbit(index: number) {
  const rec = satrecs[index];
  const meta = metas[index];
  if (!rec || !meta) return;
  const spanMin = 24 * 60; // 24 h
  const stepMin = Math.max(meta.periodMin / 120, spanMin / 2000);
  const steps = Math.min(Math.ceil(spanMin / stepMin), 2000);
  const points: number[] = [];
  const now = Date.now();
  for (let s = 0; s <= steps; s++) {
    // De (now - 24 h) jusqu'à maintenant.
    const date = new Date(now - (spanMin - (spanMin * s) / steps) * 60 * 1000);
    const pv = satellite.propagate(rec, date);
    const p = pv.position;
    if (!p || typeof p === 'boolean') continue;
    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(p, gmst);
    points.push(
      satellite.degreesLong(geo.longitude),
      satellite.degreesLat(geo.latitude),
      geo.height * 1000,
    );
  }
  post({ type: 'orbit', index, points });
}

function post(msg: WorkerOutbound, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;
  if (msg.type === 'init') init(msg.tle);
  else if (msg.type === 'orbit') orbit(msg.index);
};
