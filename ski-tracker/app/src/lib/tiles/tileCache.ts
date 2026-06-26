/**
 * Pre-caches OpenSkiMap tile URLs for the active station area.
 * Covers zoom levels 10–15 within a ~5km radius of the station center.
 */

const TILE_URL = 'https://tiles.skimap.org/v2/{z}/{x}/{y}.png'
const CACHE_NAME = 'skimap-tiles'
const MIN_ZOOM = 10
const MAX_ZOOM = 15
const RADIUS_KM = 5

/** Convert lat/lng to tile XY at a given zoom */
function latLngToTile(lat: number, lng: number, zoom: number): [number, number] {
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return [x, y]
}

/** Approximate degrees per km at a given latitude */
function kmToDeg(km: number, lat: number): { dLat: number; dLng: number } {
  const dLat = km / 111.32
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  return { dLat, dLng }
}

function buildTileUrl(z: number, x: number, y: number): string {
  return TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

/** Collect all tile URLs for the bounding box at each zoom level */
function collectTileUrls(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  minZoom: number,
  maxZoom: number
): string[] {
  const urls: string[] = []

  for (let z = minZoom; z <= maxZoom; z++) {
    const { dLat, dLng } = kmToDeg(radiusKm, centerLat)

    const [xMin] = latLngToTile(centerLat + dLat, centerLng - dLng, z)
    const [xMax] = latLngToTile(centerLat - dLat, centerLng + dLng, z)
    const [, yMin] = latLngToTile(centerLat + dLat, centerLng, z)
    const [, yMax] = latLngToTile(centerLat - dLat, centerLng, z)

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(buildTileUrl(z, x, y))
      }
    }
  }

  return urls
}

export async function precacheTiles(
  centerLat: number,
  centerLng: number,
  onProgress?: (fetched: number, total: number) => void
): Promise<void> {
  if (!('caches' in window)) return

  const urls = collectTileUrls(centerLat, centerLng, RADIUS_KM, MIN_ZOOM, MAX_ZOOM)
  const cache = await caches.open(CACHE_NAME)

  let fetched = 0
  const BATCH = 20

  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH)
    await Promise.allSettled(
      batch.map(async (url) => {
        const cached = await cache.match(url)
        if (!cached) {
          try {
            const response = await fetch(url, { mode: 'cors' })
            if (response.ok) await cache.put(url, response)
          } catch {
            // Network error — skip
          }
        }
        fetched++
        onProgress?.(fetched, urls.length)
      })
    )
  }
}

export function getTileCount(centerLat: number, centerLng: number): number {
  return collectTileUrls(centerLat, centerLng, RADIUS_KM, MIN_ZOOM, MAX_ZOOM).length
}
