// Types for OpenSkiMap GeoJSON data

export interface SkiStation {
  id: string
  name: string
  country: string
  region?: string
  center: [number, number] // [lng, lat] WGS84
  bbox?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

export type RunDifficulty = 'novice' | 'easy' | 'intermediate' | 'advanced' | 'expert' | 'freeride' | 'unknown'

export type LiftType =
  | 'chair_lift'
  | 'drag_lift'
  | 'gondola'
  | 't-bar'
  | 'j-bar'
  | 'platter'
  | 'rope_tow'
  | 'magic_carpet'
  | 'cable_car'
  | 'mixed_lift'
  | 'unknown'

export interface SkiRun {
  id: string
  name?: string
  difficulty: RunDifficulty
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString
  properties: {
    oneway?: boolean
    lit?: boolean
    grooming?: string
    snowmaking?: string
  }
}

export interface SkiLift {
  id: string
  name?: string
  type: LiftType
  geometry: GeoJSON.LineString
  properties: {
    occupancy?: number // persons per chair/cabin
    duration?: number // seconds
    capacity?: number // persons per hour
    oneway?: boolean
  }
}

// Graph types for Dijkstra routing
export interface GraphNode {
  id: string
  lat: number
  lng: number
  connectedEdges: string[] // edge IDs
}

export interface GraphEdge {
  id: string
  fromNode: string
  toNode: string
  weight: number // estimated seconds
  type: 'run' | 'lift'
  featureId: string
  name?: string
  difficulty?: RunDifficulty
  liftType?: LiftType
}

export interface SkiGraph {
  nodes: Map<string, GraphNode>
  edges: Map<string, GraphEdge>
}

export interface RouteStep {
  type: 'lift' | 'run'
  name?: string
  liftType?: LiftType
  difficulty?: RunDifficulty
  difficultyColor?: string
  estimatedSeconds: number
  geometry: GeoJSON.LineString
}

export interface Route {
  totalSeconds: number
  steps: RouteStep[]
  geometry: GeoJSON.FeatureCollection
}

// OpenSkiMap index response
export interface OpenSkiMapIndex {
  skimaps: OpenSkiMapEntry[]
}

export interface OpenSkiMapEntry {
  id: number
  name: string
  country: string
  region?: string
  lat: number
  lng: number
  url: string
}
