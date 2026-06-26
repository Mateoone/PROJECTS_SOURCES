/**
 * Builds a routing graph from parsed ski runs and lifts.
 *
 * Strategy:
 * - Each extremity of a run/lift geometry becomes a node (snapped to ~10m grid)
 * - Nearby extremities within SNAP_METERS are merged into one node
 * - Each segment becomes a directed edge (or bidirectional for runs)
 */
import type { SkiRun, SkiLift, SkiGraph, GraphNode, GraphEdge } from '@/types/skimap'
import { estimateTravelTime, haversineMeters } from './skimap'

const SNAP_METERS = 30 // merge nodes within this radius

/** Round coords to ~10m grid for snapping */
function snapKey(lat: number, lng: number): string {
  return `${Math.round(lat * 5000) / 5000},${Math.round(lng * 5000) / 5000}`
}

export function buildSkiGraph(runs: SkiRun[], lifts: SkiLift[]): SkiGraph {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()

  // Coordinate index for spatial snapping
  const coordIndex = new Map<string, string>() // snapKey -> nodeId

  function getOrCreateNode(lat: number, lng: number): string {
    const key = snapKey(lat, lng)
    if (coordIndex.has(key)) return coordIndex.get(key)!

    // Check nearby existing nodes
    for (const [existingKey, nodeId] of coordIndex) {
      const [eLat, eLng] = existingKey.split(',').map(Number)
      if (haversineMeters(lat, lng, eLat, eLng) < SNAP_METERS) {
        coordIndex.set(key, nodeId)
        return nodeId
      }
    }

    const nodeId = `n_${nodes.size}`
    const node: GraphNode = { id: nodeId, lat, lng, connectedEdges: [] }
    nodes.set(nodeId, node)
    coordIndex.set(key, nodeId)
    return nodeId
  }

  function addEdge(
    fromNode: string,
    toNode: string,
    edgeProps: Omit<GraphEdge, 'id' | 'fromNode' | 'toNode'>
  ) {
    if (fromNode === toNode) return // degenerate segment
    const edgeId = `e_${edges.size}`
    const edge: GraphEdge = { id: edgeId, fromNode, toNode, ...edgeProps }
    edges.set(edgeId, edge)
    nodes.get(fromNode)?.connectedEdges.push(edgeId)
  }

  // Process ski runs
  for (const run of runs) {
    const coords: [number, number][] = run.geometry.type === 'LineString'
      ? run.geometry.coordinates as [number, number][]
      : (run.geometry as GeoJSON.MultiLineString).coordinates.flat() as [number, number][]

    if (coords.length < 2) continue

    // Create node for first and last coord; also at each intermediate point
    const nodeIds: string[] = coords.map(([lng, lat]) => getOrCreateNode(lat, lng))

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const segGeom: GeoJSON.LineString = {
        type: 'LineString',
        coordinates: [coords[i], coords[i + 1]],
      }
      const weight = estimateTravelTime(segGeom, 'run', run.difficulty)
      // Runs are bidirectional (skier can usually ski down either edge)
      addEdge(nodeIds[i], nodeIds[i + 1], {
        weight,
        type: 'run',
        featureId: run.id,
        name: run.name,
        difficulty: run.difficulty,
      })
      if (!run.properties.oneway) {
        addEdge(nodeIds[i + 1], nodeIds[i], {
          weight,
          type: 'run',
          featureId: run.id,
          name: run.name,
          difficulty: run.difficulty,
        })
      }
    }
  }

  // Process lifts (one-way: bottom → top)
  for (const lift of lifts) {
    const coords = lift.geometry.coordinates as [number, number][]
    if (coords.length < 2) continue

    const nodeIds = coords.map(([lng, lat]) => getOrCreateNode(lat, lng))

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const segGeom: GeoJSON.LineString = {
        type: 'LineString',
        coordinates: [coords[i], coords[i + 1]],
      }
      const weight = lift.properties.duration
        ? Math.round(lift.properties.duration / (coords.length - 1))
        : estimateTravelTime(segGeom, 'lift')

      addEdge(nodeIds[i], nodeIds[i + 1], {
        weight,
        type: 'lift',
        featureId: lift.id,
        name: lift.name,
        liftType: lift.type,
      })
    }
  }

  return { nodes, edges }
}

/** Find closest graph node to a lat/lng point */
export function nearestNode(
  graph: SkiGraph,
  lat: number,
  lng: number
): GraphNode | null {
  let best: GraphNode | null = null
  let bestDist = Infinity
  for (const node of graph.nodes.values()) {
    const d = haversineMeters(lat, lng, node.lat, node.lng)
    if (d < bestDist) {
      bestDist = d
      best = node
    }
  }
  return best
}
