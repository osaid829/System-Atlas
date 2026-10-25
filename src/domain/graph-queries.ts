import type {
  AtlasGraph,
  EdgeKind,
  GraphEdge,
  GraphNode,
  SearchResult,
} from './graph'

function getNodeMap(graph: AtlasGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]))
}

function getNeighborEdges(graph: AtlasGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId)
}

function isTraversableEdge(edge: GraphEdge, kinds?: EdgeKind[]): boolean {
  return !kinds || kinds.includes(edge.kind)
}

export function getNodeById(graph: AtlasGraph, nodeId?: string): GraphNode | undefined {
  if (!nodeId) return undefined
  return graph.nodes.find((node) => node.id === nodeId)
}

export function getDependencies(graph: AtlasGraph, nodeId: string): GraphNode[] {
  const nodeMap = getNodeMap(graph)
  return graph.edges
    .filter((edge) => edge.source === nodeId && edge.kind === 'imports')
    .map((edge) => nodeMap.get(edge.target))
    .filter((node): node is GraphNode => Boolean(node))
}

export function getDependents(graph: AtlasGraph, nodeId: string): GraphNode[] {
  const nodeMap = getNodeMap(graph)
  return graph.edges
    .filter((edge) => edge.target === nodeId && edge.kind === 'imports')
    .map((edge) => nodeMap.get(edge.source))
    .filter((node): node is GraphNode => Boolean(node))
}

export function getSearchResults(graph: AtlasGraph, query: string): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const results: SearchResult[] = []
  for (const node of graph.nodes) {
    const labelMatch = node.label.toLowerCase().includes(normalizedQuery)
    const pathMatch = node.path?.toLowerCase().includes(normalizedQuery) ?? false
    if (labelMatch || pathMatch) {
      results.push({
        id: node.id,
        label: node.label,
        kind: node.kind,
        path: node.path,
        line: node.line,
        parentId: node.parentId,
      })
    }
  }

  return results.sort((left, right) => {
    const leftExact = left.label.toLowerCase() === normalizedQuery ? 0 : 1
    const rightExact = right.label.toLowerCase() === normalizedQuery ? 0 : 1
    return leftExact - rightExact || left.label.localeCompare(right.label)
  })
}

export interface FocusResult {
  nodeIds: Set<string>
  edgeIds: Set<string>
  inboundNodeIds: Set<string>
  outboundNodeIds: Set<string>
}

export function getFocusResult(
  graph: AtlasGraph,
  selectedId: string | undefined,
  depth = 1,
): FocusResult {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const inboundNodeIds = new Set<string>()
  const outboundNodeIds = new Set<string>()

  if (!selectedId) {
    return { nodeIds, edgeIds, inboundNodeIds, outboundNodeIds }
  }

  nodeIds.add(selectedId)
  const queue: Array<{ id: string; distance: number }> = [{ id: selectedId, distance: 0 }]
  const visited = new Set<string>([selectedId])
  const selectedNode = getNodeById(graph, selectedId)
  const traversableKinds: EdgeKind[] = selectedNode?.kind === 'directory'
    ? ['contains', 'imports', 'calls', 'references']
    : ['imports', 'calls', 'references']

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    for (const edge of getNeighborEdges(graph, current.id)) {
      if (!isTraversableEdge(edge, traversableKinds)) continue

      edgeIds.add(edge.id)
      const isOutbound = edge.source === current.id
      const neighborId = isOutbound ? edge.target : edge.source
      if (current.id === selectedId) {
        if (isOutbound) outboundNodeIds.add(neighborId)
        else inboundNodeIds.add(neighborId)
      }

      if (current.distance < depth && !visited.has(neighborId)) {
        visited.add(neighborId)
        nodeIds.add(neighborId)
        queue.push({ id: neighborId, distance: current.distance + 1 })
      }
    }
  }

  return { nodeIds, edgeIds, inboundNodeIds, outboundNodeIds }
}

export function getConnectionPath(
  graph: AtlasGraph,
  sourceId: string,
  targetId: string,
): string[] {
  if (sourceId === targetId) return [sourceId]

  const previous = new Map<string, string | undefined>([[sourceId, undefined]])
  const queue = [sourceId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) break

    for (const edge of getNeighborEdges(graph, currentId)) {
      if (!isTraversableEdge(edge, ['imports', 'calls', 'references'])) continue
      const nextId = edge.source === currentId ? edge.target : edge.source
      if (previous.has(nextId)) continue
      previous.set(nextId, currentId)
      queue.push(nextId)
      if (nextId === targetId) {
        const path: string[] = []
        let cursor: string | undefined = targetId
        while (cursor) {
          path.unshift(cursor)
          cursor = previous.get(cursor)
        }
        return path
      }
    }
  }

  return []
}
