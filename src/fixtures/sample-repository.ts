import {
  createEdgeId,
  createNodeId,
  type AtlasGraph,
  type GraphEdge,
  type GraphNode,
} from '../domain/graph'

function directory(path: string, parentId?: string): GraphNode {
  return {
    id: createNodeId('directory', path),
    kind: 'directory',
    label: path.split('/').at(-1) ?? path,
    path,
    parentId,
  }
}

function file(
  path: string,
  directoryId: string,
  symbols: GraphNode['symbols'] = [],
): GraphNode {
  const label = path.split('/').at(-1) ?? path
  return {
    id: createNodeId('file', path),
    kind: 'file',
    label,
    path,
    directoryId,
    parentId: directoryId,
    extension: label.includes('.') ? `.${label.split('.').at(-1)}` : undefined,
    symbols,
    metrics: {
      lineCount: 84 + path.length,
      symbolCount: symbols.length,
    },
  }
}

function symbol(path: string, name: string, line: number, parentId: string): GraphNode {
  return {
    id: createNodeId('symbol', `${path}:${name}`),
    kind: 'symbol',
    label: name,
    path,
    line,
    parentId,
    exported: true,
  }
}

function packageNode(name: string): GraphNode {
  return {
    id: createNodeId('package', name),
    kind: 'package',
    label: name,
    path: name,
    external: true,
  }
}

function edge(kind: GraphEdge['kind'], source: string, target: string, options?: Partial<GraphEdge>): GraphEdge {
  return {
    id: createEdgeId(kind, source, target),
    source,
    target,
    kind,
    ...options,
  }
}

export function createSampleGraph(): AtlasGraph {
  const root = directory('.')
  const src = directory('src', root.id)
  const app = directory('src/app', src.id)
  const graph = directory('src/graph', src.id)
  const features = directory('src/features', src.id)
  const shared = directory('src/shared', src.id)
  const tests = directory('tests', root.id)

  const appFile = file('src/app/App.tsx', app.id, [
    { id: 'sample:app', name: 'App', kind: 'function', line: 12, exported: true },
    { id: 'sample:render', name: 'renderAtlas', kind: 'function', line: 44, exported: true },
  ])
  const shellFile = file('src/app/AtlasShell.tsx', app.id, [
    { id: 'sample:shell', name: 'AtlasShell', kind: 'function', line: 8, exported: true },
  ])
  const graphModelFile = file('src/graph/model.ts', graph.id, [
    { id: 'sample:normalize', name: 'normalizeGraph', kind: 'function', line: 31, exported: true },
  ])
  const graphQueriesFile = file('src/graph/queries.ts', graph.id, [
    { id: 'sample:focus', name: 'getFocusSubgraph', kind: 'function', line: 18, exported: true },
    { id: 'sample:dependents', name: 'getDependents', kind: 'function', line: 62, exported: true },
  ])
  const parserFile = file('src/features/parse/parser.ts', features.id, [
    { id: 'sample:parse', name: 'parseRepository', kind: 'function', line: 24, exported: true },
    { id: 'sample:imports', name: 'extractImports', kind: 'function', line: 83, exported: true },
  ])
  const searchFile = file('src/features/search/searchIndex.ts', features.id, [
    { id: 'sample:index', name: 'buildSearchIndex', kind: 'function', line: 10, exported: true },
  ])
  const fileReader = file('src/shared/fileReader.ts', shared.id, [
    { id: 'sample:read', name: 'readProjectFiles', kind: 'function', line: 15, exported: true },
  ])
  const fixtureTest = file('tests/graphQueries.test.ts', tests.id, [
    { id: 'sample:test', name: 'focusesConnectedNodes', kind: 'function', line: 21, exported: false },
  ])

  const symbols = [
    symbol(appFile.path!, 'App', 12, appFile.id),
    symbol(appFile.path!, 'renderAtlas', 44, appFile.id),
    symbol(shellFile.path!, 'AtlasShell', 8, shellFile.id),
    symbol(graphModelFile.path!, 'normalizeGraph', 31, graphModelFile.id),
    symbol(graphQueriesFile.path!, 'getFocusSubgraph', 18, graphQueriesFile.id),
    symbol(graphQueriesFile.path!, 'getDependents', 62, graphQueriesFile.id),
    symbol(parserFile.path!, 'parseRepository', 24, parserFile.id),
    symbol(parserFile.path!, 'extractImports', 83, parserFile.id),
    symbol(searchFile.path!, 'buildSearchIndex', 10, searchFile.id),
    symbol(fileReader.path!, 'readProjectFiles', 15, fileReader.id),
    symbol(fixtureTest.path!, 'focusesConnectedNodes', 21, fixtureTest.id),
  ]

  const packageReact = packageNode('react')
  const packageThree = packageNode('@react-three/fiber')
  const packageD3 = packageNode('d3-force')

  const nodes = [
    root,
    src,
    app,
    graph,
    features,
    shared,
    tests,
    appFile,
    shellFile,
    graphModelFile,
    graphQueriesFile,
    parserFile,
    searchFile,
    fileReader,
    fixtureTest,
    ...symbols,
    packageReact,
    packageThree,
    packageD3,
  ]

  const edges: GraphEdge[] = [
    edge('contains', root.id, src.id),
    edge('contains', root.id, tests.id),
    edge('contains', src.id, app.id),
    edge('contains', src.id, graph.id),
    edge('contains', src.id, features.id),
    edge('contains', src.id, shared.id),
    edge('contains', app.id, appFile.id),
    edge('contains', app.id, shellFile.id),
    edge('contains', graph.id, graphModelFile.id),
    edge('contains', graph.id, graphQueriesFile.id),
    edge('contains', features.id, parserFile.id),
    edge('contains', features.id, searchFile.id),
    edge('contains', shared.id, fileReader.id),
    edge('contains', tests.id, fixtureTest.id),
    ...symbols.map((item) => edge('contains', item.parentId!, item.id)),
    edge('imports', appFile.id, shellFile.id, { resolved: true }),
    edge('imports', appFile.id, graphQueriesFile.id, { resolved: true }),
    edge('imports', appFile.id, packageReact.id, { resolved: true }),
    edge('imports', appFile.id, packageThree.id, { resolved: true }),
    edge('imports', shellFile.id, searchFile.id, { resolved: true }),
    edge('imports', shellFile.id, packageReact.id, { resolved: true }),
    edge('imports', graphQueriesFile.id, graphModelFile.id, { resolved: true }),
    edge('imports', parserFile.id, graphModelFile.id, { resolved: true }),
    edge('imports', parserFile.id, fileReader.id, { resolved: true }),
    edge('imports', parserFile.id, packageD3.id, { resolved: true }),
    edge('imports', searchFile.id, graphModelFile.id, { resolved: true }),
    edge('imports', fixtureTest.id, graphQueriesFile.id, { resolved: true }),
    edge('calls', appFile.id, graphQueriesFile.id, { heuristic: true }),
    edge('calls', graphQueriesFile.id, graphModelFile.id, { heuristic: true }),
    edge('calls', parserFile.id, graphModelFile.id, { heuristic: true }),
  ]

  return {
    nodes,
    edges,
    diagnostics: [
      {
        id: 'sample:diagnostic',
        severity: 'info',
        message: 'Sample fixture loaded. Replace it with a pasted tree or local project scan.',
      },
    ],
    sourceMode: 'dependencies',
    sourceLabel: 'sample repository / system-atlas',
    projectName: 'system-atlas sample',
  }
}
