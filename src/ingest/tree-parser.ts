import {
  createEdgeId,
  createNodeId,
  type AtlasGraph,
  type GraphDiagnostic,
  type GraphEdge,
  type GraphNode,
} from '../domain/graph'

interface ParsedEntry {
  path: string
  directory: boolean
}

const knownFileNames = new Set(['Dockerfile', 'Makefile', 'LICENSE', 'README', 'README.md'])

function normalizePath(value: string): string {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
}

function isLikelyFile(segment: string): boolean {
  return knownFileNames.has(segment) || segment.includes('.')
}

function extractTreeEntry(rawLine: string): { depth: number; label: string; treeLike: boolean } {
  const branchIndex = rawLine.search(/[├└]/)
  const treeLike = branchIndex >= 0 || /\|--|`--/.test(rawLine)

  if (!treeLike) {
    const leading = rawLine.match(/^\s*/)?.[0].length ?? 0
    return { depth: Math.floor(leading / 2), label: rawLine.trim(), treeLike: false }
  }

  const prefix = branchIndex >= 0 ? rawLine.slice(0, branchIndex) : rawLine.slice(0, rawLine.search(/\|--|`--/))
  const depth = Math.floor(prefix.replaceAll('│', ' ').length / 4) + 1
  const label = rawLine
    .slice(branchIndex >= 0 ? branchIndex : rawLine.search(/\|--|`--/))
    .replace(/^(?:├──|└──|├─|└─|\|--|`--|[-─])\s*/, '')
    .trim()

  return { depth, label, treeLike: true }
}

function parseEntries(input: string): ParsedEntry[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))

  const hasTreeMarkers = lines.some((line) => /[├└│]|\|--|`--/.test(line))
  if (!hasTreeMarkers) {
    return lines.map((line) => {
      const directory = line.trim().endsWith('/')
      return { path: normalizePath(line), directory }
    })
  }

  const stack: string[] = []
  return lines.map((line) => {
    const { depth, label } = extractTreeEntry(line)
    const directory = label.trim().endsWith('/')
    const cleanLabel = normalizePath(label)
    const parent = depth > 0 ? stack[depth - 1] : undefined
    const path = normalizePath(parent ? `${parent}/${cleanLabel}` : cleanLabel)
    stack.splice(depth)
    stack[depth] = path
    return { path, directory }
  })
}

function addDirectory(
  directories: Map<string, GraphNode>,
  path: string,
  parentId?: string,
): GraphNode {
  const id = createNodeId('directory', path || '.')
  const existing = directories.get(id)
  if (existing) return existing

  const label = path ? path.split('/').at(-1) ?? path : '.'
  const directory: GraphNode = {
    id,
    kind: 'directory',
    label,
    path: path || '.',
    parentId,
  }
  directories.set(id, directory)
  return directory
}

function addDirectoryChain(
  directories: Map<string, GraphNode>,
  path: string,
  edges: GraphEdge[],
): string {
  const segments = path.split('/').filter(Boolean)
  let parentPath = ''
  let parentId: string | undefined

  if (segments.length === 0) {
    return addDirectory(directories, '.', undefined).id
  }

  for (const segment of segments) {
    const currentPath = parentPath ? `${parentPath}/${segment}` : segment
    const directory = addDirectory(directories, currentPath, parentId)
    if (parentId) {
      const edgeId = createEdgeId('contains', parentId, directory.id)
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push({ id: edgeId, source: parentId, target: directory.id, kind: 'contains' })
      }
    }
    parentPath = currentPath
    parentId = directory.id
  }

  return parentId ?? addDirectory(directories, '.', undefined).id
}

export function parseTreeText(
  input: string,
  sourceLabel = 'pasted tree',
  projectName = 'pasted structure',
): AtlasGraph {
  const entries = parseEntries(input)
  const directories = new Map<string, GraphNode>()
  const files = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const diagnostics: GraphDiagnostic[] = []
  const explicitDirectories = new Set<string>()
  const paths = new Set(entries.map((entry) => entry.path))

  for (const entry of entries) {
    if (entry.directory) explicitDirectories.add(entry.path)
    const segments = entry.path.split('/').filter(Boolean)
    const parentPath = segments.slice(0, -1).join('/')
    if (parentPath) addDirectoryChain(directories, parentPath, edges)
  }

  for (const entry of entries) {
    const path = entry.path
    if (!path) continue
    const segments = path.split('/').filter(Boolean)
    const parentPath = segments.slice(0, -1).join('/')
    const lastSegment = segments.at(-1) ?? path
    const hasChild = [...paths].some((candidate) => candidate !== path && candidate.startsWith(`${path}/`))
    const directory = entry.directory || hasChild || !isLikelyFile(lastSegment)

    if (directory) {
      addDirectoryChain(directories, path, edges)
      continue
    }

    const directoryId = parentPath ? addDirectoryChain(directories, parentPath, edges) : addDirectoryChain(directories, '', edges)
    const id = createNodeId('file', path)
    if (files.has(id)) continue
    const extension = lastSegment.includes('.') ? `.${lastSegment.split('.').at(-1)}` : undefined
    const file: GraphNode = {
      id,
      kind: 'file',
      label: lastSegment,
      path,
      parentId: directoryId,
      directoryId,
      extension,
      metrics: {},
    }
    files.set(id, file)
    const edgeId = createEdgeId('contains', directoryId, id)
    edges.push({ id: edgeId, source: directoryId, target: id, kind: 'contains' })
  }

  if (entries.length === 0) {
    diagnostics.push({
      id: 'tree:empty',
      severity: 'warning',
      message: 'Paste a directory tree or a newline-separated list of paths to begin.',
    })
  }

  if (explicitDirectories.size > 0 && files.size === 0) {
    diagnostics.push({
      id: 'tree:structure-only',
      severity: 'info',
      message: 'Structure loaded. Upload source files to reveal imports and functions.',
    })
  }

  return {
    nodes: [...directories.values(), ...files.values()],
    edges,
    diagnostics,
    sourceMode: 'structure',
    sourceLabel,
    projectName,
  }
}
