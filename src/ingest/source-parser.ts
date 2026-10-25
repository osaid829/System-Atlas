import * as ts from 'typescript'
import {
  createEdgeId,
  createNodeId,
  type AtlasGraph,
  type GraphDiagnostic,
  type GraphEdge,
  type GraphNode,
  type SymbolSummary,
} from '../domain/graph'
import { shouldIgnorePath } from './ignore-rules'

export interface SourceFileInput {
  path: string
  content: string
}

interface ParsedFile {
  input: SourceFileInput
  sourceFile: ts.SourceFile
  symbols: SymbolSummary[]
  imports: Array<{ specifier: string; line: number }>
  calls: Array<{ name: string; line: number }>
  diagnostics: GraphDiagnostic[]
}

const supportedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

function normalizePath(value: string): string {
  const segments = value.replaceAll('\\', '/').replace(/^\//, '').split('/')
  const normalized: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }
  return normalized.join('/')
}

function extensionForPath(path: string): string | undefined {
  const match = path.match(/\.[^./]+$/)
  return match?.[0]
}

function scriptKindForPath(path: string): ts.ScriptKind {
  switch (extensionForPath(path)) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function isSourceFile(path: string): boolean {
  const extension = extensionForPath(path)
  return Boolean(extension && supportedExtensions.has(extension))
}

function packageName(specifier: string): string {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

function collectSymbols(sourceFile: ts.SourceFile): SymbolSummary[] {
  const symbols: SymbolSummary[] = []

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({
        id: `${sourceFile.fileName}:${node.name.text}`,
        name: node.name.text,
        kind: 'function',
        line: lineNumber(sourceFile, node),
        exported: node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      })
    }

    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      symbols.push({
        id: `${sourceFile.fileName}:${node.name.text}`,
        name: node.name.text,
        kind: 'method',
        line: lineNumber(sourceFile, node),
        exported: false,
      })
    }

    if (ts.isClassDeclaration(node) && node.name) {
      symbols.push({
        id: `${sourceFile.fileName}:${node.name.text}`,
        name: node.name.text,
        kind: 'class',
        line: lineNumber(sourceFile, node),
        exported: node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      })
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      symbols.push({
        id: `${sourceFile.fileName}:${node.name.text}`,
        name: node.name.text,
        kind: 'function',
        line: lineNumber(sourceFile, node),
        exported: false,
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return symbols.filter((symbol, index, items) => items.findIndex((item) => item.id === symbol.id) === index)
}

function collectImportsAndCalls(
  sourceFile: ts.SourceFile,
): { imports: Array<{ specifier: string; line: number }>; calls: Array<{ name: string; line: number }> } {
  const imports: Array<{ specifier: string; line: number }> = []
  const calls: Array<{ name: string; line: number }> = []

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, line: lineNumber(sourceFile, node) })
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, line: lineNumber(sourceFile, node) })
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ specifier: node.arguments[0].text, line: lineNumber(sourceFile, node) })
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.push({ name: node.expression.text, line: lineNumber(sourceFile, node) })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { imports, calls }
}

function resolveRelativeImport(specifier: string, importerPath: string, paths: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined

  const importerDirectory = importerPath.split('/').slice(0, -1).join('/')
  const basePath = normalizePath(importerDirectory ? `${importerDirectory}/${specifier}` : specifier)
  const candidates = [
    basePath,
    ...sourceExtensions.map((extension) => `${basePath}${extension}`),
    ...sourceExtensions.map((extension) => `${basePath}/index${extension}`),
  ]

  return candidates.find((candidate) => paths.has(candidate))
}

function createDirectoryChain(
  directories: Map<string, GraphNode>,
  path: string,
  edges: GraphEdge[],
): string {
  const segments = path.split('/').filter(Boolean)
  let parentId: string | undefined
  let parentPath = ''

  for (const segment of segments) {
    const currentPath = parentPath ? `${parentPath}/${segment}` : segment
    const id = createNodeId('directory', currentPath)
    if (!directories.has(id)) {
      directories.set(id, {
        id,
        kind: 'directory',
        label: segment,
        path: currentPath,
        parentId,
      })
    }

    if (parentId) {
      const edgeId = createEdgeId('contains', parentId, id)
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push({ id: edgeId, source: parentId, target: id, kind: 'contains' })
      }
    }

    parentId = id
    parentPath = currentPath
  }

  if (!parentId) {
    const rootId = createNodeId('directory', '.')
    if (!directories.has(rootId)) {
      directories.set(rootId, { id: rootId, kind: 'directory', label: '.', path: '.' })
    }
    return rootId
  }

  return parentId
}

function getParentPath(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

export function parseSourceFiles(
  inputs: SourceFileInput[],
  sourceLabel = 'uploaded project',
  projectName = 'uploaded project',
): AtlasGraph {
  const files = inputs
    .map((input) => ({ ...input, path: normalizePath(input.path) }))
    .filter((input) => isSourceFile(input.path) && !shouldIgnorePath(input.path))
  const filePaths = new Set(files.map((file) => file.path))
  const directories = new Map<string, GraphNode>()
  const fileNodes = new Map<string, GraphNode>()
  const packageNodes = new Map<string, GraphNode>()
  const parsedFiles: ParsedFile[] = []
  const edges: GraphEdge[] = []
  const diagnostics: GraphDiagnostic[] = []

  for (const input of files) {
    const sourceFile = ts.createSourceFile(
      input.path,
      input.content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(input.path),
    )
    const parentPath = getParentPath(input.path)
    const directoryId = createDirectoryChain(directories, parentPath, edges)
    const symbols = collectSymbols(sourceFile)
    const { imports, calls } = collectImportsAndCalls(sourceFile)
    const fileId = createNodeId('file', input.path)
    fileNodes.set(fileId, {
      id: fileId,
      kind: 'file',
      label: input.path.split('/').at(-1) ?? input.path,
      path: input.path,
      parentId: directoryId,
      directoryId,
      extension: extensionForPath(input.path),
      symbols,
      metrics: {
        lineCount: input.content.split(/\r?\n/).length,
        symbolCount: symbols.length,
      },
    })
    edges.push({ id: createEdgeId('contains', directoryId, fileId), source: directoryId, target: fileId, kind: 'contains' })
    parsedFiles.push({ input, sourceFile, symbols, imports, calls, diagnostics: [] })

    const transpileResult = ts.transpileModule(input.content, {
      fileName: input.path,
      reportDiagnostics: true,
      compilerOptions: {
        allowJs: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    for (const diagnostic of transpileResult.diagnostics ?? []) {
      diagnostics.push({
        id: `syntax:${input.path}:${diagnostic.start ?? 0}`,
        severity: 'error',
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        path: input.path,
        line: diagnostic.start === undefined ? undefined : sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
      })
    }
  }

  const symbolNameToFile = new Map<string, string>()
  for (const node of fileNodes.values()) {
    for (const symbol of node.symbols ?? []) {
      symbolNameToFile.set(symbol.name, node.id)
      const symbolId = createNodeId('symbol', `${node.path}:${symbol.name}`)
      const symbolNode: GraphNode = {
        id: symbolId,
        kind: 'symbol',
        label: symbol.name,
        path: node.path,
        line: symbol.line,
        parentId: node.id,
        directoryId: node.directoryId,
        exported: symbol.exported,
      }
      fileNodes.set(symbolId, symbolNode)
      edges.push({ id: createEdgeId('contains', node.id, symbolId), source: node.id, target: symbolId, kind: 'contains' })
    }
  }

  for (const parsed of parsedFiles) {
    const sourceId = createNodeId('file', parsed.input.path)
    for (const imported of parsed.imports) {
      const relativeTarget = resolveRelativeImport(imported.specifier, parsed.input.path, filePaths)
      if (relativeTarget) {
        const targetId = createNodeId('file', relativeTarget)
        edges.push({
          id: createEdgeId('imports', sourceId, targetId),
          source: sourceId,
          target: targetId,
          kind: 'imports',
          label: imported.specifier,
          resolved: true,
        })
        continue
      }

      if (!imported.specifier.startsWith('.')) {
        const name = packageName(imported.specifier)
        const packageId = createNodeId('package', name)
        if (!packageNodes.has(packageId)) {
          packageNodes.set(packageId, {
            id: packageId,
            kind: 'package',
            label: name,
            path: name,
            external: true,
          })
        }
        edges.push({
          id: createEdgeId('imports', sourceId, packageId),
          source: sourceId,
          target: packageId,
          kind: 'imports',
          label: imported.specifier,
          resolved: true,
        })
        continue
      }

      diagnostics.push({
        id: `unresolved:${parsed.input.path}:${imported.line}:${imported.specifier}`,
        severity: 'warning',
        message: `Could not resolve ${imported.specifier}`,
        path: parsed.input.path,
        line: imported.line,
      })
    }

    for (const call of parsed.calls) {
      const targetFileId = symbolNameToFile.get(call.name)
      if (!targetFileId || targetFileId === sourceId) continue
      edges.push({
        id: createEdgeId('calls', sourceId, targetFileId),
        source: sourceId,
        target: targetFileId,
        kind: 'calls',
        label: call.name,
        heuristic: true,
      })
    }
  }

  const uniqueEdges = edges.filter((edge, index, all) => all.findIndex((item) => item.id === edge.id) === index)

  return {
    nodes: [...directories.values(), ...fileNodes.values(), ...packageNodes.values()],
    edges: uniqueEdges,
    diagnostics,
    sourceMode: 'dependencies',
    sourceLabel,
    projectName,
  }
}
