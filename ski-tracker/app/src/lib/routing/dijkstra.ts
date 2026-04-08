/**
 * Dijkstra shortest-path on the ski graph.
 * Returns a Route (ordered list of steps) or null if no path found.
 */
import type { SkiGraph, Route, RouteStep } from '@/types/skimap'
import { nearestNode } from './graph'
import { difficultyColor } from './skimap'

class MinHeap {
  private heap: Array<{ id: string; cost: number }> = []

  push(item: { id: string; cost: number }) {
    this.heap.push(item)
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): { id: string; cost: number } | undefined {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.sinkDown(0)
    }
    return top
  }

  get size() { return this.heap.length }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (this.heap[parent].cost <= this.heap[i].cost) break
      ;[this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]]
      i = parent
    }
  }

  private sinkDown(i: number) {
    const n = this.heap.length
    while (true) {
      let smallest = i
      const l = 2 * i + 1, r = 2 * i + 2
      if (l < n && this.heap[l].cost < this.heap[smallest].cost) smallest = l
      if (r < n && this.heap[r].cost < this.heap[smallest].cost) smallest = r
      if (smallest === i) break
      ;[this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]]
      i = smallest
    }
  }
}

export function findRoute(
  graph: SkiGraph,
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): Route | null {
  const startNode = nearestNode(graph, fromLat, fromLng)
  const endNode = nearestNode(graph, toLat, toLng)
  if (!startNode || !endNode) return null
  if (startNode.id === endNode.id) return { totalSeconds: 0, steps: [], geometry: { type: 'FeatureCollection', features: [] } }

  const dist = new Map<string, number>()
  const prev = new Map<string, { nodeId: string; edgeId: string } | null>()
  const heap = new MinHeap()

  for (const nodeId of graph.nodes.keys()) {
    dist.set(nodeId, Infinity)
  }
  dist.set(startNode.id, 0)
  prev.set(startNode.id, null)
  heap.push({ id: startNode.id, cost: 0 })

  while (heap.size > 0) {
    const { id: current, cost } = heap.pop()!

    if (current === endNode.id) break
    if (cost > (dist.get(current) ?? Infinity)) continue

    const node = graph.nodes.get(current)!
    for (const edgeId of node.connectedEdges) {
      const edge = graph.edges.get(edgeId)!
      if (edge.fromNode !== current) continue // directed edge check

      const newCost = cost + edge.weight
      if (newCost < (dist.get(edge.toNode) ?? Infinity)) {
        dist.set(edge.toNode, newCost)
        prev.set(edge.toNode, { nodeId: current, edgeId })
        heap.push({ id: edge.toNode, cost: newCost })
      }
    }
  }

  if ((dist.get(endNode.id) ?? Infinity) === Infinity) return null

  // Reconstruct path
  const edgePath: string[] = []
  let cur: string | null = endNode.id
  while (prev.has(cur!) && prev.get(cur!) !== null) {
    const p = prev.get(cur!)!
    edgePath.unshift(p.edgeId)
    cur = p.nodeId
  }

  // Merge consecutive same-feature edges into steps
  const steps: RouteStep[] = []
  const geoFeatures: GeoJSON.Feature[] = []

  for (const edgeId of edgePath) {
    const edge = graph.edges.get(edgeId)!
    const from = graph.nodes.get(edge.fromNode)!
    const to = graph.nodes.get(edge.toNode)!
    const segGeom: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
    }

    const last = steps[steps.length - 1]
    if (last && last.type === edge.type && last.name === edge.name) {
      // Extend existing step geometry
      const coords = last.geometry.coordinates as [number, number][]
      coords.push([to.lng, to.lat])
      last.estimatedSeconds += edge.weight
    } else {
      steps.push({
        type: edge.type,
        name: edge.name,
        liftType: edge.liftType,
        difficulty: edge.difficulty,
        difficultyColor: edge.difficulty ? difficultyColor(edge.difficulty) : undefined,
        estimatedSeconds: edge.weight,
        geometry: segGeom,
      })
    }

    geoFeatures.push({
      type: 'Feature',
      geometry: segGeom,
      properties: {
        type: edge.type,
        name: edge.name ?? null,
        difficulty: edge.difficulty ?? null,
        liftType: edge.liftType ?? null,
      },
    })
  }

  return {
    totalSeconds: dist.get(endNode.id)!,
    steps,
    geometry: { type: 'FeatureCollection', features: geoFeatures },
  }
}
