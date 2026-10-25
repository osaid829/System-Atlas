export type NodeKind = 'directory' | 'file' | 'symbol' | 'package'

export type EdgeKind = 'contains' | 'imports' | 'exports' | 'calls' | 'references'

export type SourceMode = 'structure' | 'dependencies'

export interface SymbolSummary {
  id: string
  name: string
  kind: 'function' | 'method' | 'class' | 'constant'
  line?: number
  exported?: boolean
}

export interface GraphNodeMetrics {
  lineCount?: number
  importCount?: number
  importedByCount?: number
  symbolCount?: number
}

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  path?: string
  parentId?: string
  directoryId?: string
  extension?: string
  line?: number
  exported?: boolean
  external?: boolean
  symbols?: SymbolSummary[]
  metrics?: GraphNodeMetrics
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  label?: string
  resolved?: boolean
  heuristic?: boolean
}

export interface GraphDiagnostic {
  id: string
  severity: 'info' | 'warning' | 'error'
  message: string
  path?: string
  line?: number
}

export interface AtlasGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  diagnostics: GraphDiagnostic[]
  sourceMode: SourceMode
  sourceLabel: string
  projectName?: string
}

export interface SearchResult {
  id: string
  label: string
  kind: NodeKind
  path?: string
  line?: number
  parentId?: string
}

export interface GraphMetrics {
  nodeCount: number
  edgeCount: number
  directoryCount: number
  fileCount: number
  symbolCount: number
  packageCount: number
  diagnosticCount: number
}

export function getGraphMetrics(graph: AtlasGraph): GraphMetrics {
  return graph.nodes.reduce<GraphMetrics>(
    (metrics, node) => {
      metrics.nodeCount += 1
      if (node.kind === 'directory') metrics.directoryCount += 1
      if (node.kind === 'file') metrics.fileCount += 1
      if (node.kind === 'symbol') metrics.symbolCount += 1
      if (node.kind === 'package') metrics.packageCount += 1
      return metrics
    },
    {
      nodeCount: 0,
      edgeCount: graph.edges.length,
      directoryCount: 0,
      fileCount: 0,
      symbolCount: 0,
      packageCount: 0,
      diagnosticCount: graph.diagnostics.length,
    },
  )
}

export function createNodeId(kind: NodeKind, value: string): string {
  return `${kind}:${value}`
}

export function createEdgeId(kind: EdgeKind, source: string, target: string): string {
  return `${kind}:${source}->${target}`
}
