/**
 * OpenSkiMap GeoJSON parser
 * Extracts runs and lifts from an OpenSkiMap GeoJSON feature collection
 * and builds a routable graph.
 */
import type { SkiRun, SkiLift, RunDifficulty, LiftType } from '@/types/skimap'

const DIFFICULTY_MAP: Record<string, RunDifficulty> = {
  novice: 'novice',
  easy: 'easy',
  intermediate: 'intermediate',
  advanced: 'advanced',
  expert: 'expert',
  freeride: 'freeride',
}

const LIFT_TYPE_MAP: Record<string, LiftType> = {
  chair_lift: 'chair_lift',
  drag_lift: 'drag_lift',
  gondola: 'gondola',
  't-bar': 't-bar',
  j_bar: 'j-bar',
  platter: 'platter',
  rope_tow: 'rope_tow',
  magic_carpet: 'magic_carpet',
  cable_car: 'cable_car',
  mixed_lift: 'mixed_lift',
}

// Average speeds in m/s for routing weights
const LIFT_SPEED_MS = 3.5      // ~12 km/h typical chairlift
const RUN_SPEED_MS: Record<RunDifficulty, number> = {
  novice:       2.0,   // ~7 km/h
  easy:         4.0,   // ~14 km/h
  intermediate: 6.0,   // ~22 km/h
  advanced:     9.0,   // ~32 km/h
  expert:       12.0,  // ~43 km/h
  freeride:     8.0,
  unknown:      5.0,
}

export function parseSkiMapGeoJSON(geojson: GeoJSON.FeatureCollection): {
  runs: SkiRun[]
  lifts: SkiLift[]
} {
  const runs: SkiRun[] = []
  const lifts: SkiLift[] = []

  for (const feature of geojson.features) {
    if (!feature.geometry || !feature.properties) continue
    const p = feature.properties as Record<string, unknown>

    // Detect ski runs (piste:type = downhill | nordic | etc.)
    if (p['piste:type'] || p['run:difficulty']) {
      const difficulty =
        DIFFICULTY_MAP[(p['piste:difficulty'] as string)?.toLowerCase()] ?? 'unknown'

      if (
        feature.geometry.type === 'LineString' ||
        feature.geometry.type === 'MultiLineString'
      ) {
        runs.push({
          id: String(feature.id ?? Math.random()),
          name: p.name as string | undefined,
          difficulty,
          geometry: feature.geometry as GeoJSON.LineString | GeoJSON.MultiLineString,
          properties: {
            oneway: p.oneway === 'yes',
            lit: p.lit === 'yes',
            grooming: p.grooming as string | undefined,
            snowmaking: p.snowmaking as string | undefined,
          },
        })
      }
    }

    // Detect lifts (aerialway = *)
    if (p.aerialway && feature.geometry.type === 'LineString') {
      const liftType = LIFT_TYPE_MAP[p.aerialway as string] ?? 'unknown'
      lifts.push({
        id: String(feature.id ?? Math.random()),
        name: p.name as string | undefined,
        type: liftType,
        geometry: feature.geometry as GeoJSON.LineString,
        properties: {
          occupancy: p.aerialway_occupancy
            ? Number(p.aerialway_occupancy)
            : undefined,
          duration: p.duration ? Number(p.duration) : undefined,
          oneway: p.oneway !== 'no',
        },
      })
    }
  }

  return { runs, lifts }
}

/** Calculate great-circle distance in metres between two WGS84 points */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Estimate travel time in seconds for a line geometry */
export function estimateTravelTime(
  geometry: GeoJSON.LineString,
  type: 'run' | 'lift',
  difficulty?: RunDifficulty
): number {
  const coords = geometry.coordinates as [number, number][]
  let totalMeters = 0
  for (let i = 1; i < coords.length; i++) {
    totalMeters += haversineMeters(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
  }
  const speed = type === 'lift'
    ? LIFT_SPEED_MS
    : RUN_SPEED_MS[difficulty ?? 'unknown']
  return Math.round(totalMeters / speed)
}

export function difficultyColor(d: RunDifficulty): string {
  const colors: Record<RunDifficulty, string> = {
    novice:       '#22c55e', // green
    easy:         '#3b82f6', // blue
    intermediate: '#ef4444', // red
    advanced:     '#1e1e1e', // black
    expert:       '#1e1e1e',
    freeride:     '#f97316', // orange
    unknown:      '#94a3b8', // slate
  }
  return colors[d]
}
