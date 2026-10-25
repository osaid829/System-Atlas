import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { AtlasGraph, GraphNode } from '../domain/graph'

export interface LayoutPoint extends SimulationNodeDatum {
  id: string
  node: GraphNode
  x: number
  y: number
  z: number
  radius: number
}

interface LayoutLink extends SimulationLinkDatum<LayoutPoint> {
  source: string | LayoutPoint
  target: string | LayoutPoint
}

export interface GraphLayout {
  points: Map<string, LayoutPoint>
  links: LayoutLink[]
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function initialCoordinate(value: string, offset: number): number {
  const normalized = ((hash(value) + offset) % 10_000) / 10_000
  return (normalized - 0.5) * 12
}

function radiusForNode(node: GraphNode): number {
  if (node.kind === 'directory') return 0.34
  if (node.kind === 'package') return 0.25
  if (node.kind === 'symbol') return 0.16
  const imports = node.metrics?.importCount ?? 0
  return Math.min(0.28 + imports * 0.02, 0.48)
}

function fitPointsToCamera(points: LayoutPoint[]): void {
  if (points.length === 0) return

  const bounds = points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  )
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const halfExtent = Math.max((bounds.maxX - bounds.minX) / 2, (bounds.maxY - bounds.minY) / 2, 1)
  const scale = Math.min(1, 6.4 / halfExtent)

  for (const point of points) {
    point.x = (point.x - centerX) * scale
    point.y = (point.y - centerY) * scale
  }
}

export function computeGraphLayout(graph: AtlasGraph, includeSymbols = false): GraphLayout {
  const visibleNodes = graph.nodes.filter((node) => includeSymbols || node.kind !== 'symbol')
  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const points = visibleNodes.map<LayoutPoint>((node) => ({
    id: node.id,
    node,
    x: initialCoordinate(node.id, 17),
    y: initialCoordinate(node.id, 71),
    z: node.kind === 'directory' ? -0.15 : node.kind === 'package' ? 0.2 : 0,
    radius: radiusForNode(node),
  }))

  const links: LayoutLink[] = graph.edges
    .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
    .filter((edge) => edge.kind !== 'contains' || graph.nodes.some((node) => node.id === edge.target && node.kind !== 'symbol'))
    .map((edge) => ({ source: edge.source, target: edge.target }))

  const simulation = forceSimulation(points)
    .force(
      'link',
      forceLink<LayoutPoint, LayoutLink>(links)
        .id((point) => point.id)
        .distance((link) => {
          const source = typeof link.source === 'string' ? undefined : link.source
          const target = typeof link.target === 'string' ? undefined : link.target
          if (source?.node.kind === 'directory' || target?.node.kind === 'directory') return 2.1
          return 1.7
        })
        .strength((link) => {
          const source = typeof link.source === 'string' ? undefined : link.source
          const target = typeof link.target === 'string' ? undefined : link.target
          if (source?.node.kind === 'directory' || target?.node.kind === 'directory') return 0.65
          return 0.24
        }),
    )
    .force('charge', forceManyBody<LayoutPoint>().strength(-2.8))
    .force('x', forceX<LayoutPoint>(0).strength(0.04))
    .force('y', forceY<LayoutPoint>(0).strength(0.04))
    .force('center', forceCenter(0, 0))
    .force(
      'collide',
      forceCollide<LayoutPoint>().radius((point) => point.radius + 0.2),
    )
    .stop()

  for (let tick = 0; tick < 220; tick += 1) simulation.tick()
  fitPointsToCamera(points)

  const layoutPoints = new Map(points.map((point) => [point.id, point]))
  return { points: layoutPoints, links }
}
