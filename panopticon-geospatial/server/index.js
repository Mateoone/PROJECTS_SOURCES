/**
 * PANOPTICON — Proxy géospatial Express.
 *
 * Rôle :
 *  - Agrège les TLE Celestrak (22 groupes) avec cache mémoire agressif et
 *    requêtes cadencées pour éviter le rate-limiting / bannissement de flux.
 *  - Proxifie OpenSky (trafic aérien), USGS (sismes) et Windy (webcams).
 *  - Compresse en GZIP, masque les clés d'API, contourne les blocages CORS.
 */
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';
import https from 'node:https';
import { URLSearchParams as NodeURLSearchParams } from 'node:url';

// Cloud Run: force IPv4 — opensky-network.org ne répond qu'en IPv4.
setDefaultResultOrder('ipv4first');

// Charge le .env si présent (Node >= 20.6).
try {
  process.loadEnvFile?.();
} catch {
  /* pas de .env : on s'appuie sur les valeurs par défaut */
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(compression());
app.use(cors());

/* ------------------------------------------------------------------ *
 *  Cache mémoire générique avec TTL.
 * ------------------------------------------------------------------ */
const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  return null;
}

function setCached(key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Requête HTTPS via le module natif Node (http2 désactivé, HTTP/1.1 pur).
 * Utilisé pour OpenSky : undici (native fetch) échoue sur leurs serveurs
 * depuis Google Cloud Run alors que le module https Node fonctionne.
 */
function httpsRequest(url, { method = 'GET', headers = {}, body, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers: { 'User-Agent': 'PanopticonGeospatial/1.0', ...headers },
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} @ ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.setTimeout(timeout, () => { req.destroy(new Error(`timeout @ ${url}`)); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchText(url, { timeout = 15000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ *
 *  A. SATELLITES — agrégation TLE Celestrak (22 groupes).
 * ------------------------------------------------------------------ */
const CELESTRAK_GROUPS = [
  'active', 'stations', 'visual', 'starlink', 'oneweb', 'iridium',
  'iridium-NEXT', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'sbas',
  'gnss', 'science', 'geo', 'intelsat', 'ses', 'weather', 'noaa',
  'goes', 'resource', 'cubesat',
];
const TLE_TTL = 2 * 60 * 60 * 1000; // 2 heures
const GROUP_DELAY = 350; // cadençage entre groupes (ms)

let tleRefreshing = false;

/** Parse un bloc TLE 3 lignes -> [{name, l1, l2, noradId, group}]. */
function parseTle(raw, group) {
  const lines = raw.split(/\r?\n/).map((l) => l.trimEnd());
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!name || !l1 || !l2) continue;
    if (l1[0] !== '1' || l2[0] !== '2') continue;
    const noradId = l1.substring(2, 7).trim();
    out.push({ name: name.trim(), l1, l2, noradId, group });
  }
  return out;
}

async function aggregateTle() {
  const byId = new Map();
  let okGroups = 0;
  for (const group of CELESTRAK_GROUPS) {
    const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
    try {
      const raw = await fetchText(url, { timeout: 20000 });
      const sats = parseTle(raw, group);
      for (const s of sats) {
        // Premier groupe gagne (priorité de classement), pas d'écrasement.
        if (s.noradId && !byId.has(s.noradId)) byId.set(s.noradId, s);
      }
      okGroups += 1;
      console.log(`[TLE] ${group}: +${sats.length} (total ${byId.size})`);
    } catch (err) {
      console.warn(`[TLE] échec groupe ${group}: ${err.message}`);
    }
    await sleep(GROUP_DELAY);
  }
  return { sats: [...byId.values()], okGroups, count: byId.size };
}

async function refreshTleCache(force = false) {
  if (!force && getCached('tle')) return getCached('tle');
  if (tleRefreshing) {
    // Attend la fin du rafraîchissement en cours.
    while (tleRefreshing) await sleep(250);
    return getCached('tle');
  }
  tleRefreshing = true;
  try {
    const result = await aggregateTle();
    if (result.count > 0) setCached('tle', result, TLE_TTL);
    return result;
  } finally {
    tleRefreshing = false;
  }
}

app.get('/api/tle', async (_req, res) => {
  try {
    const cached = getCached('tle');
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }
    res.set('X-Cache', 'MISS');
    const result = await refreshTleCache();
    if (!result || result.count === 0) {
      return res.status(502).json({ error: 'Aucun TLE disponible', sats: [] });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, sats: [] });
  }
});

/* ------------------------------------------------------------------ *
 *  B. TRAFIC AÉRIEN — proxy OpenSky (OAuth2 + cache robuste).
 *
 *  Le quota ANONYME d'OpenSky (~400 crédits/jour) sature vite → HTTP 429 →
 *  "INDISPONIBLE". Avec un API client OpenSky (OAuth2 client-credentials),
 *  le quota est bien supérieur. On stabilise aussi le cache en "snappant" la
 *  bbox sur une grille (réutilisation au moindre déplacement caméra) et on
 *  ressert la dernière donnée valide en cas d'échec.
 * ------------------------------------------------------------------ */
const AIRCRAFT_TTL = 30 * 1000;
const lastGoodAircraft = new Map(); // clé bbox -> dernier payload valide
let lastGoodGlobal = null; // dernier payload valide (avec sa bbox)

const OPENSKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
let openSkyToken = null; // { value, expires }

/** Jeton OAuth2 OpenSky, mis en cache et rafraîchi avant expiration.
 *  Utilise httpsRequest (Node https natif) car undici/fetch échoue depuis Cloud Run. */
async function getOpenSkyToken() {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (openSkyToken && openSkyToken.expires > Date.now()) return openSkyToken.value;
  try {
    const body = new NodeURLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }).toString();
    const raw = await httpsRequest(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      timeout: 25000,
    });
    const data = JSON.parse(raw);
    openSkyToken = {
      value: data.access_token,
      expires: Date.now() + ((data.expires_in || 1800) - 60) * 1000,
    };
    console.log('[AIR] jeton OAuth2 OpenSky obtenu');
    return openSkyToken.value;
  } catch (err) {
    console.warn(`[AIR] échec jeton OAuth2: ${err.message}`);
    return null;
  }
}

async function openSkyHeaders() {
  const token = await getOpenSkyToken();
  if (token) return { Authorization: `Bearer ${token}` };
  // Repli Basic (déprécié) si encore configuré.
  if (process.env.OPENSKY_USER && process.env.OPENSKY_PASS) {
    const b = Buffer.from(
      `${process.env.OPENSKY_USER}:${process.env.OPENSKY_PASS}`,
    ).toString('base64');
    return { Authorization: `Basic ${b}` };
  }
  return {};
}

/** Snap la bbox sur une grille (degrés) pour stabiliser la clé de cache. */
function snapBbox(lamin, lomin, lamax, lomax, g = 4) {
  const fl = (v) => Math.floor(v / g) * g;
  const cl = (v) => Math.ceil(v / g) * g;
  return {
    lamin: Math.max(-90, fl(lamin)),
    lomin: Math.max(-180, fl(lomin)),
    lamax: Math.min(90, cl(lamax)),
    lomax: Math.min(180, cl(lomax)),
  };
}

/** Parse le format adsb.lol/readsb → même structure que l'ancienne sortie OpenSky. */
function parseAdsbLol(data) {
  const FT_TO_M = 0.3048;
  const KT_TO_MS = 0.514444;
  return (data.ac || [])
    .map((a) => {
      const onGround = a.alt_baro === 'ground';
      const baroAlt = onGround ? 0 : (typeof a.alt_baro === 'number' ? a.alt_baro * FT_TO_M : null);
      const geoAlt = typeof a.alt_geom === 'number' ? a.alt_geom * FT_TO_M : baroAlt;
      return {
        icao24: a.hex,
        callsign: (a.flight || '').trim(),
        origin: a.r || '',
        lon: a.lon,
        lat: a.lat,
        baroAlt,
        onGround,
        velocity: typeof a.gs === 'number' ? a.gs * KT_TO_MS : null,
        heading: a.track ?? a.true_heading ?? null,
        geoAlt,
        type: a.t || null,
        reg: a.r || null,
      };
    })
    .filter((s) => s.lat != null && s.lon != null && !s.onGround);
}

/** Filtre un payload global sur une bbox (repli stale localisé). */
function filterToBbox(payload, b) {
  if (!b) return payload;
  const states = payload.states.filter(
    (s) => s.lat >= b.lamin && s.lat <= b.lamax && s.lon >= b.lomin && s.lon <= b.lomax,
  );
  return { ...payload, count: states.length, states };
}

/** Convertit une bbox en point central + rayon (nm) pour l'API adsb.lol. */
function bboxToCircle(b) {
  const lat = (b.lamin + b.lamax) / 2;
  const lon = (b.lomin + b.lomax) / 2;
  const dLat = (b.lamax - b.lamin) / 2 * 111;   // km
  const dLon = (b.lomax - b.lomin) / 2 * Math.cos(lat * Math.PI / 180) * 111;
  const radiusKm = Math.sqrt(dLat * dLat + dLon * dLon);
  const radiusNm = Math.min(Math.ceil(radiusKm / 1.852), 600); // cap 600 nm
  return { lat: lat.toFixed(4), lon: lon.toFixed(4), radiusNm };
}

app.get('/api/aircraft', async (req, res) => {
  const { lamin, lomin, lamax, lomax } = req.query;
  const snapped =
    lamin && lomin && lamax && lomax
      ? snapBbox(+lamin, +lomin, +lamax, +lomax)
      : null;

  // Clé de cache basée sur le bbox snappé (stable pour les petits mouvements caméra).
  const cacheKey = snapped
    ? `air:${snapped.lamin},${snapped.lomin},${snapped.lamax},${snapped.lomax}`
    : 'air:global';

  const cached = getCached(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  try {
    let url;
    if (snapped) {
      const { lat, lon, radiusNm } = bboxToCircle(snapped);
      url = `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`;
    } else {
      // Vue globale : centre monde, rayon max
      url = 'https://api.adsb.lol/v2/point/20/0/600';
    }
    const raw = await httpsRequest(url, { timeout: 20000 });
    const data = JSON.parse(raw);
    const states = parseAdsbLol(data);
    const payload = {
      time: (data.now || Date.now()) / 1000,
      count: states.length,
      states,
      source: 'adsbLol',
    };
    setCached(cacheKey, payload, AIRCRAFT_TTL);
    lastGoodAircraft.set(cacheKey, payload);
    lastGoodGlobal = { ...payload, bbox: snapped };
    console.log(`[AIR] adsb.lol → ${states.length} avions`);
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    console.warn(`[AIR] ${err.name}: ${err.message}`);
    let stale = lastGoodAircraft.get(cacheKey);
    if (!stale && lastGoodGlobal) stale = filterToBbox(lastGoodGlobal, snapped);
    if (stale) {
      setCached(cacheKey, { ...stale, stale: true }, AIRCRAFT_TTL);
      return res.json({ ...stale, stale: true });
    }
    res.json({ time: Date.now() / 1000, count: 0, states: [], degraded: true });
  }
});

/* ------------------------------------------------------------------ *
 *  B-bis. PHOTO D'AVION — proxy Planespotters par adresse ICAO24.
 *  L'API exige un User-Agent descriptif avec URL de contact.
 * ------------------------------------------------------------------ */
const PHOTO_TTL = 12 * 60 * 60 * 1000; // 12 h (les photos ne changent pas)
const PHOTO_UA =
  'PanopticonGeospatial/1.0 (+https://panopticon-58899663812.europe-west9.run.app)';

app.get('/api/aircraft-photo', async (req, res) => {
  const icao24 = String(req.query.icao24 || '').toLowerCase().trim();
  if (!/^[0-9a-f]{6}$/.test(icao24)) {
    return res.status(400).json({ error: 'icao24 invalide', photo: null });
  }
  const key = `photo:${icao24}`;
  const cached = getCached(key);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }
  try {
    const raw = await fetchText(
      `https://api.planespotters.net/pub/photos/hex/${icao24}`,
      { timeout: 10000, headers: { 'User-Agent': PHOTO_UA } },
    );
    const data = JSON.parse(raw);
    const p = (data.photos || [])[0];
    const photo = p
      ? {
          thumbnail: p.thumbnail_large?.src || p.thumbnail?.src,
          link: p.link,
          photographer: p.photographer,
        }
      : null;
    const payload = { icao24, photo };
    setCached(key, payload, PHOTO_TTL);
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    console.warn(`[PHOTO] ${icao24}: ${err.message}`);
    res.json({ icao24, photo: null });
  }
});

/* ------------------------------------------------------------------ *
 *  A-bis. FICHE SATELLITE — catalogue CelesTrak SATCAT + Wikipédia.
 *  Renvoie le type d'objet, lanceur, mission, et une photo (Wikipédia).
 * ------------------------------------------------------------------ */
const SATINFO_TTL = 24 * 60 * 60 * 1000;

/** Devine un titre Wikipédia pertinent à partir du nom / groupe. */
function wikiTermForSat(name, group) {
  const n = (name || '').toUpperCase();
  const g = (group || '').toLowerCase();
  if (g === 'starlink' || n.includes('STARLINK')) return 'Starlink';
  if (g === 'oneweb' || n.includes('ONEWEB')) return 'OneWeb';
  if (n.includes('IRIDIUM')) return 'Iridium satellite constellation';
  if (n.includes('ISS') || n.includes('ZARYA')) return 'International Space Station';
  if (n.includes('TIANGONG') || n.includes('TIANHE') || n.includes('CSS (')) return 'Tiangong space station';
  if (n.includes('HUBBLE') || n === 'HST') return 'Hubble Space Telescope';
  if (n.includes('NAVSTAR') || g === 'gps-ops') return 'Global Positioning System';
  if (n.includes('GALILEO')) return 'Galileo (satellite navigation)';
  if (n.includes('GLONASS') || g === 'glo-ops') return 'GLONASS';
  if (n.includes('BEIDOU')) return 'BeiDou';
  if (n.includes('GOES')) return 'GOES';
  if (n.includes('LANDSAT')) return 'Landsat program';
  if (n.includes('SENTINEL')) return 'Copernicus Programme';
  if (n.includes('TERRA')) return 'Terra (satellite)';
  if (n.includes('AQUA')) return 'Aqua (satellite)';
  // Défaut : on retire un suffixe désignateur final (ex. "-1049", " 19").
  const t = (name || '').replace(/[\s-]+[0-9A-Z]{1,6}$/, '').trim();
  return t || (name || '').trim();
}

async function fetchSatcat(norad) {
  try {
    const raw = await fetchText(
      `https://celestrak.org/satcat/records.php?CATNR=${norad}&FORMAT=json`,
      { timeout: 10000 },
    );
    const r = JSON.parse(raw)?.[0];
    if (!r) return null;
    return {
      name: r.OBJECT_NAME,
      intlDes: r.OBJECT_ID,
      type: r.OBJECT_TYPE,
      status: r.OPS_STATUS_CODE,
      owner: r.OWNER,
      launchDate: r.LAUNCH_DATE,
      launchSite: r.LAUNCH_SITE,
      decayDate: r.DECAY_DATE,
      rcs: r.RCS,
    };
  } catch {
    return null;
  }
}

// Vrais clichés (Wikimedia Commons) par constellation — au lieu du logo Wikipédia.
const CONSTELLATION_PHOTO = {
  starlink: 'Starlink Mission (47926144123).jpg',
  iridium: 'Iridium satellite.jpg',
  gps: 'GPS Block IIIA.jpg',
  galileo: 'Galileo satellite model.jpg',
};

function photoKeyForSat(name, group) {
  const n = (name || '').toUpperCase();
  const g = (group || '').toLowerCase();
  if (g === 'starlink' || n.includes('STARLINK')) return 'starlink';
  if (n.includes('IRIDIUM')) return 'iridium';
  if (n.includes('NAVSTAR') || g === 'gps-ops' || n.includes('GPS ')) return 'gps';
  if (n.includes('GALILEO')) return 'galileo';
  return null;
}

/** Résout le nom d'un fichier Commons en URL de vignette directe. */
async function resolveCommonsImage(filename) {
  if (!filename) return null;
  try {
    const raw = await fetchText(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json`,
      { timeout: 10000, headers: { 'User-Agent': PHOTO_UA } },
    );
    const p = Object.values(JSON.parse(raw).query.pages)[0];
    const ii = (p.imageinfo || [])[0];
    return ii?.thumburl || ii?.url || null;
  } catch {
    return null;
  }
}

async function fetchWiki(term) {
  if (!term) return null;
  try {
    const raw = await fetchText(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}?redirect=true`,
      { timeout: 10000, headers: { 'User-Agent': PHOTO_UA, accept: 'application/json' } },
    );
    const d = JSON.parse(raw);
    if (d.type === 'disambiguation') return null;
    return {
      title: d.title,
      extract: d.extract,
      image: d.originalimage?.source || d.thumbnail?.source || null,
      url: d.content_urls?.desktop?.page,
    };
  } catch {
    return null;
  }
}

app.get('/api/satellite-info', async (req, res) => {
  const norad = String(req.query.norad || '').trim();
  if (!/^\d+$/.test(norad)) {
    return res.status(400).json({ error: 'norad invalide' });
  }
  const key = `satinfo:${norad}`;
  const cached = getCached(key);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }
  const photoKey = photoKeyForSat(req.query.name, req.query.group);
  const [satcatR, wikiR, photoR] = await Promise.allSettled([
    fetchSatcat(norad),
    fetchWiki(wikiTermForSat(req.query.name, req.query.group)),
    photoKey ? resolveCommonsImage(CONSTELLATION_PHOTO[photoKey]) : Promise.resolve(null),
  ]);
  const wiki = wikiR.status === 'fulfilled' ? wikiR.value : null;
  const curated = photoR.status === 'fulfilled' ? photoR.value : null;
  const payload = {
    norad,
    satcat: satcatR.status === 'fulfilled' ? satcatR.value : null,
    wiki,
    // Photo : cliché curé de la constellation en priorité, sinon image Wikipédia.
    image: curated || wiki?.image || null,
  };
  setCached(key, payload, SATINFO_TTL);
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

/* ------------------------------------------------------------------ *
 *  C. SISMES — proxy USGS (séismes de l'heure écoulée).
 * ------------------------------------------------------------------ */
const QUAKE_TTL = 60 * 1000;

app.get('/api/earthquakes', async (req, res) => {
  const window = req.query.window === 'day' ? 'all_day' : 'all_hour';
  const key = `quake:${window}`;
  const cached = getCached(key);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }
  try {
    const raw = await fetchText(
      `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${window}.geojson`,
      { timeout: 12000 },
    );
    const data = JSON.parse(raw);
    const quakes = (data.features || []).map((f) => ({
      id: f.id,
      place: f.properties.place,
      mag: f.properties.mag,
      time: f.properties.time,
      tsunami: f.properties.tsunami,
      url: f.properties.url,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depth: f.geometry.coordinates[2],
    })).filter((q) => q.mag != null);
    const payload = { count: quakes.length, quakes };
    setCached(key, payload, QUAKE_TTL);
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    console.warn(`[SIS] ${err.message}`);
    res.json({ count: 0, quakes: [], degraded: true });
  }
});

/* ------------------------------------------------------------------ *
 *  D. CAMÉRAS / CCTV — proxy Windy Webcams v3 + replis municipaux.
 * ------------------------------------------------------------------ */
const WEBCAM_TTL = 5 * 60 * 1000;

/** TfL JamCams (Londres) — ~900 caméras, images JPEG directes, SANS clé. */
async function fetchTflCams() {
  const cachedTfl = getCached('tfl');
  if (cachedTfl) return cachedTfl;
  const raw = await fetchText('https://api.tfl.gov.uk/Place/Type/JamCam', {
    timeout: 15000,
  });
  const data = JSON.parse(raw);
  const out = (Array.isArray(data) ? data : [])
    .map((p) => {
      const props = Object.fromEntries(
        (p.additionalProperties || []).map((a) => [a.key, a.value]),
      );
      if (props.available === 'false' || !props.imageUrl) return null;
      return {
        id: p.id,
        title: p.commonName,
        lat: p.lat,
        lon: p.lon,
        city: 'London',
        country: 'GB',
        preview: props.imageUrl,
        stream: props.videoUrl || props.imageUrl,
      };
    })
    .filter(Boolean);
  setCached('tfl', out, WEBCAM_TTL);
  return out;
}

/**
 * Windy Webcams v3 — réseau mondial (~72k). Si un centre (lat/lon) est fourni,
 * on récupère les webcams À PROXIMITÉ (réactif) ; sinon les plus populaires.
 */
async function fetchWindyCams({ lat, lon, radius } = {}) {
  if (!process.env.WINDY_API_KEY) return [];
  const near =
    lat != null && lon != null
      ? `&nearby=${lat},${lon},${radius || 200}`
      : '';
  const raw = await fetchText(
    `https://api.windy.com/webcams/api/v3/webcams?limit=50${near}&include=location,images,urls,player`,
    { timeout: 12000, headers: { 'x-windy-api-key': process.env.WINDY_API_KEY } },
  );
  const data = JSON.parse(raw);
  return (data.webcams || [])
    .map((w) => ({
      id: String(w.webcamId ?? w.id),
      title: w.title,
      lat: w.location?.latitude,
      lon: w.location?.longitude,
      city: w.location?.city,
      country: w.location?.country,
      preview: w.images?.current?.preview || w.images?.daylight?.preview,
      stream: w.player?.live?.embed || w.urls?.detail,
    }))
    .filter((w) => w.lat != null && w.lon != null && w.preview);
}

// Flux municipaux / publics de repli ultime.
const FALLBACK_WEBCAMS = [
  { id: 'nyc-times-sq', title: 'New York — Times Square', lat: 40.758, lon: -73.9855, stream: 'https://www.earthcam.com/usa/newyork/timessquare/' },
  { id: 'tokyo-shibuya', title: 'Tokyo — Shibuya Crossing', lat: 35.6595, lon: 139.7005, stream: 'https://www.youtube.com/watch?v=Wpd_yJfB8wM' },
  { id: 'london-abbey', title: 'London — Abbey Road', lat: 51.5319, lon: -0.1779, stream: 'https://www.abbeyroad.com/crossing' },
  { id: 'paris-eiffel', title: 'Paris — Tour Eiffel', lat: 48.8584, lon: 2.2945, stream: 'https://www.skylinewebcams.com/en/webcam/france/ile-de-france/paris/tour-eiffel.html' },
  { id: 'venice-rialto', title: 'Venezia — Rialto', lat: 45.438, lon: 12.336, stream: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/canal-grande.html' },
  { id: 'dubai', title: 'Dubai — Marina', lat: 25.08, lon: 55.14, stream: 'https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/dubai-marina.html' },
  { id: 'sydney', title: 'Sydney — Harbour', lat: -33.857, lon: 151.215, stream: 'https://www.skylinewebcams.com/en/webcam/australia/new-south-wales/sydney/sydney.html' },
  { id: 'rio', title: 'Rio de Janeiro — Copacabana', lat: -22.971, lon: -43.182, stream: 'https://www.skylinewebcams.com/en/webcam/brasil/rio-de-janeiro/rio-de-janeiro/copacabana.html' },
];

app.get('/api/webcams', async (req, res) => {
  const lat = req.query.lat != null ? Number(req.query.lat) : null;
  const lon = req.query.lon != null ? Number(req.query.lon) : null;
  const radius = req.query.radius != null ? Number(req.query.radius) : null;
  const key =
    lat != null && lon != null
      ? `webcams:${lat.toFixed(1)},${lon.toFixed(1)},${radius || 200}`
      : 'webcams:global';
  const cached = getCached(key);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }
  const out = [];
  const sources = [];
  const [tfl, windy] = await Promise.allSettled([
    fetchTflCams(),
    fetchWindyCams({ lat, lon, radius }),
  ]);
  if (windy.status === 'fulfilled' && windy.value.length) {
    out.push(...windy.value);
    sources.push(`windy(${windy.value.length})`);
  } else if (windy.status === 'rejected') {
    console.warn(`[CCTV] windy: ${windy.reason?.message}`);
  }
  if (tfl.status === 'fulfilled' && tfl.value.length) {
    out.push(...tfl.value);
    sources.push(`tfl(${tfl.value.length})`);
  } else if (tfl.status === 'rejected') {
    console.warn(`[CCTV] tfl: ${tfl.reason?.message}`);
  }
  if (!out.length) {
    out.push(...FALLBACK_WEBCAMS);
    sources.push('fallback');
  }
  const payload = { count: out.length, webcams: out, source: sources.join('+') };
  setCached(key, payload, WEBCAM_TTL);
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

/* ------------------------------------------------------------------ *
 *  Santé + état du cache (pour le terminal de log télémétrique).
 * ------------------------------------------------------------------ */
app.get('/api/health', (_req, res) => {
  const tle = getCached('tle');
  res.json({
    status: 'ONLINE',
    uptime: Math.floor(process.uptime()),
    satellites: tle?.count ?? 0,
    tleGroups: tle?.okGroups ?? 0,
    aircraft: 'adsb.lol',
    cacheKeys: [...cache.keys()],
    ts: Date.now(),
  });
});

/* ------------------------------------------------------------------ *
 *  Service des fichiers statiques en production.
 * ------------------------------------------------------------------ */
if (IS_PROD) {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  PANOPTICON PROXY ::  http://localhost:${PORT}  ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
  // Préchauffe le cache TLE au démarrage (asynchrone, non bloquant).
  refreshTleCache().then((r) => r && console.log(`[TLE] cache initial: ${r.count} satellites`));
});
