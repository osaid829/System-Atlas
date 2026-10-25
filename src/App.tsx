import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  BracketsCurly,
  CaretRight,
  Code,
  Command,
  Crosshair,
  Cube,
  FolderOpen,
  GitBranch,
  Info,
  MagnifyingGlass,
  Scan,
  Stack,
  Target,
  UploadSimple,
  Warning,
  X,
} from '@phosphor-icons/react'
import './App.css'
import { getGraphMetrics, type AtlasGraph, type GraphNode, type SearchResult } from './domain/graph'
import {
  getDependencies,
  getDependents,
  getNodeById,
  getSearchResults,
} from './domain/graph-queries'
import { createSampleGraph } from './fixtures/sample-repository'
import type { SourceFileInput } from './ingest/source-parser'
import { parseSourceFilesInWorker } from './ingest/parse-in-worker'
import { projectNameFromPath } from './ingest/project-name'
import { parseTreeText } from './ingest/tree-parser'
import { hasWebGLSupport } from './scene/webgl'
import type { ViewMode } from './scene/AtlasCanvas'

const AtlasCanvas = lazy(() => import('./scene/AtlasCanvas').then((module) => ({ default: module.AtlasCanvas })))

const exampleTree = `system-atlas/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── AtlasShell.tsx
│   ├── graph/
│   │   ├── model.ts
│   │   └── queries.ts
│   └── features/
│       ├── parser.ts
│       └── searchIndex.ts
├── package.json
└── README.md`

type ScanState = 'ready' | 'reading' | 'error'

function nodeKindLabel(kind: GraphNode['kind']): string {
  switch (kind) {
    case 'directory':
      return 'directory'
    case 'file':
      return 'source file'
    case 'symbol':
      return 'function / symbol'
    case 'package':
      return 'external package'
  }
}

function displayPath(node?: GraphNode): string {
  if (!node) return 'No selection'
  return node.path ?? node.label
}

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('System Atlas scene failed to render', error, info)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

function CanvasLoadingState() {
  return (
    <div className="canvas-state canvas-loading" role="status">
      <span className="canvas-state-marker" />
      <strong>Mounting node field</strong>
      <span>Preparing the local scene...</span>
    </div>
  )
}

function GraphFallback({ graph, selectedId, onSelect }: { graph: AtlasGraph; selectedId?: string; onSelect: (nodeId: string) => void }) {
  const nodes = graph.nodes.filter((node) => node.kind !== 'symbol').slice(0, 80)
  return (
    <div className="graph-fallback" role="region" aria-label="Accessible architecture index">
      <div className="canvas-state-marker" />
      <div className="fallback-heading">
        <Warning size={18} />
        <div><strong>Canvas unavailable</strong><span>Use the accessible entity index below.</span></div>
      </div>
      <div className="fallback-list">
        {nodes.map((node) => (
          <button type="button" key={node.id} className={selectedId === node.id ? 'fallback-node active' : 'fallback-node'} onClick={() => onSelect(node.id)}>
            <span className={`result-glyph ${node.kind}`} />
            <span><strong>{node.label}</strong><small>{node.path ?? node.kind}</small></span>
            <CaretRight size={13} />
          </button>
        ))}
      </div>
      {graph.nodes.length > nodes.length && <p className="fallback-note">Showing the first {nodes.length} visible entities. Narrow the scan to explore more.</p>}
    </div>
  )
}

function asSourceFiles(fileList: FileList): Promise<SourceFileInput[]> {
  const files = [...fileList]
  return Promise.all(
    files.map(async (file) => {
      const candidate = file as File & { webkitRelativePath?: string }
      return {
        path: candidate.webkitRelativePath || candidate.name,
        content: await file.text(),
      }
    }),
  )
}

function projectNameFromFileList(fileList: FileList): string {
  const firstFile = fileList[0] as (File & { webkitRelativePath?: string }) | undefined
  return projectNameFromPath(firstFile?.webkitRelativePath || firstFile?.name || '', fileList.length)
}

function projectNameFromTreeText(input: string): string {
  const firstLine = input.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ''
  const cleanedName = firstLine.replace(/^[├└│─`|\s]+/, '').replace(/[\\/]$/, '').trim()
  return cleanedName || 'pasted structure'
}

function getStoredUploadCount(): number {
  if (typeof window === 'undefined') return 0
  try {
    const storedValue = Number(window.sessionStorage.getItem('system-atlas:uploaded-projects') ?? 0)
    return Number.isFinite(storedValue) && storedValue > 0 ? storedValue : 0
  } catch {
    return 0
  }
}

function persistUploadCount(value: number): void {
  try {
    window.sessionStorage.setItem('system-atlas:uploaded-projects', String(value))
  } catch {
    // Session storage is optional; the in-memory counter remains available.
  }
}

function RelationshipList({
  title,
  items,
  direction,
  onSelect,
}: {
  title: string
  items: GraphNode[]
  direction: 'inbound' | 'outbound'
  onSelect: (nodeId: string) => void
}) {
  const Icon = direction === 'inbound' ? ArrowDown : ArrowUp
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <span>{title}</span>
        <span className="section-count">{items.length.toString().padStart(2, '0')}</span>
      </div>
      {items.length === 0 ? (
        <p className="quiet-copy">No direct relationships in this scan.</p>
      ) : (
        <div className="relationship-list">
          {items.slice(0, 7).map((item) => (
            <button type="button" className="relationship-item" key={item.id} onClick={() => onSelect(item.id)}>
              <Icon size={13} weight="bold" />
              <span>{item.label}</span>
              <CaretRight size={12} />
            </button>
          ))}
          {items.length > 7 && <span className="more-count">+{items.length - 7} more</span>}
        </div>
      )}
    </section>
  )
}

function App() {
  const [graph, setGraph] = useState<AtlasGraph>(() => createSampleGraph())
  const [treeInput, setTreeInput] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [viewMode, setViewMode] = useState<ViewMode>('2d')
  const [focusDepth, setFocusDepth] = useState(1)
  const [showDirectories, setShowDirectories] = useState(true)
  const [showPackages, setShowPackages] = useState(true)
  const [scanState, setScanState] = useState<ScanState>('ready')
  const [scanMessage, setScanMessage] = useState('Sample fixture mounted')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [webglAvailable] = useState(() => hasWebGLSupport())
  const [uploadedProjectCount, setUploadedProjectCount] = useState(getStoredUploadCount)

  const metrics = useMemo(() => getGraphMetrics(graph), [graph])
  const searchResults = useMemo(() => getSearchResults(graph, query).slice(0, 10), [graph, query])
  const selectedNode = useMemo(() => getNodeById(graph, selectedId), [graph, selectedId])
  const dependencies = useMemo(
    () => (selectedNode ? getDependencies(graph, selectedNode.kind === 'symbol' ? selectedNode.parentId ?? selectedNode.id : selectedNode.id) : []),
    [graph, selectedNode],
  )
  const dependents = useMemo(
    () => (selectedNode ? getDependents(graph, selectedNode.kind === 'symbol' ? selectedNode.parentId ?? selectedNode.id : selectedNode.id) : []),
    [graph, selectedNode],
  )
  const selectedOwner = selectedNode?.kind === 'symbol' ? getNodeById(graph, selectedNode.parentId) : undefined
  const selectedFunctions = selectedOwner?.symbols ?? selectedNode?.symbols ?? []

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape') {
        setQuery('')
        setSelectedId(undefined)
      }
      if (event.key.toLowerCase() === 'r' && event.target instanceof HTMLElement && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
        setSelectedId(undefined)
        setFocusDepth(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const selectSearchResult = (result: SearchResult) => {
    setSelectedId(result.id)
    setQuery(result.label)
  }

  const loadTree = () => {
    if (!treeInput.trim()) {
      setScanState('error')
      setScanMessage('Paste a directory tree before scanning')
      return
    }
    setGraph(parseTreeText(treeInput, 'pasted tree', projectNameFromTreeText(treeInput)))
    setSelectedId(undefined)
    setScanState('ready')
    setScanMessage('Structure scan complete')
  }

  const loadExampleTree = () => {
    setTreeInput(exampleTree)
    setGraph(parseTreeText(exampleTree, 'example directory tree', 'example directory tree'))
    setSelectedId(undefined)
    setScanState('ready')
    setScanMessage('Example structure loaded')
  }

  const loadSample = () => {
    setGraph(createSampleGraph())
    setSelectedId(undefined)
    setTreeInput('')
    setScanState('ready')
    setScanMessage('Sample fixture mounted')
  }

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    const uploadedProjectName = projectNameFromFileList(fileList)
    setScanState('reading')
    setScanMessage(`Reading ${uploadedProjectName}`)
    try {
      const inputs = await asSourceFiles(fileList)
      const nextGraph = await parseSourceFilesInWorker(inputs, 'local project scan', uploadedProjectName)
      setGraph(nextGraph)
      setSelectedId(undefined)
      setUploadedProjectCount((count) => {
        const nextCount = count + 1
        persistUploadCount(nextCount)
        return nextCount
      })
      setScanState('ready')
      setScanMessage(`${uploadedProjectName} indexed · ${nextGraph.nodes.length} entities found`)
    } catch (error) {
      setScanState('error')
      setScanMessage(error instanceof Error ? error.message : 'Could not read the selected files')
    }
  }

  const resetView = () => {
    setSelectedId(undefined)
    setQuery('')
    setFocusDepth(1)
    setViewMode('2d')
  }

  const sourceLabel = graph.sourceMode === 'structure' ? 'STRUCTURE ONLY' : 'DEPENDENCY SCAN'
  const sourceIcon = graph.sourceMode === 'structure' ? <Stack size={15} /> : <GitBranch size={15} />
  const projectName = graph.projectName ?? graph.sourceLabel
  const uploadCountLabel = uploadedProjectCount === 1 ? 'folder uploaded' : 'folders uploaded'

  return (
    <main className="atlas-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Crosshair size={20} weight="bold" />
          </div>
          <div>
            <div className="brand-name">SYSTEM / ATLAS</div>
            <div className="brand-caption">architecture observatory</div>
          </div>
        </div>
        <div className="topbar-middle">
          <span className="telemetry-dot" />
          <span>{scanState === 'reading' ? 'PARSING LOCAL INPUT' : 'LOCAL-FIRST ANALYSIS'}</span>
          <span className="topbar-separator">/</span>
          <span className="topbar-project-name">{projectName}</span>
        </div>
        <div className="upload-counter" aria-label={`${uploadedProjectCount} ${uploadCountLabel}`}>
          <strong>{uploadedProjectCount.toString().padStart(2, '0')}</strong>
          <span>{uploadCountLabel}</span>
        </div>
        <div className="view-switch" aria-label="View mode">
          <button className={viewMode === '2d' ? 'active' : ''} type="button" onClick={() => setViewMode('2d')}>
            2D
          </button>
          <button className={viewMode === '3d' ? 'active' : ''} type="button" onClick={() => setViewMode('3d')}>
            <Cube size={14} /> 3D
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="left-rail" aria-label="Atlas controls">
          <section className="rail-section source-panel">
            <div className="eyebrow"><Scan size={13} /> INGEST</div>
            <h1>Load a system.</h1>
            <p className="rail-copy">Paste structure for a fast map, or upload source files to reveal dependencies.</p>
            <div className="source-actions">
              <button type="button" className="primary-action" onClick={() => fileInputRef.current?.click()}>
                <UploadSimple size={16} /> Upload project
              </button>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                multiple
                // @ts-expect-error webkitdirectory is supported by Chromium-based browsers.
                webkitdirectory=""
                onChange={(event) => {
                  const input = event.currentTarget
                  void handleFiles(input.files).finally(() => {
                    input.value = ''
                  })
                }}
              />
              <button type="button" className="secondary-action" onClick={loadSample}>
                <BracketsCurly size={16} /> Load sample
              </button>
            </div>
            <label className="field-label" htmlFor="tree-input">Directory tree</label>
            <textarea
              id="tree-input"
              value={treeInput}
              onChange={(event) => setTreeInput(event.target.value)}
              placeholder={'system-atlas/\n├── src/\n│   └── App.tsx'}
              rows={7}
            />
            <div className="field-actions">
              <button type="button" className="scan-button" onClick={loadTree}>
                <FolderOpen size={15} /> Scan tree
              </button>
              <button type="button" className="text-button" onClick={loadExampleTree}>Use example</button>
            </div>
            <p className="micro-copy"><Info size={12} /> Local-only parsing. Source content stays in this browser.</p>
          </section>

          <section className="rail-section project-summary">
            <div className="eyebrow"><FolderOpen size={13} /> ACTIVE PROJECT</div>
            <strong className="project-summary-name" title={projectName}>{projectName}</strong>
            <span className="project-summary-source">{sourceLabel.toLowerCase()} · {graph.sourceLabel}</span>
            <div className="project-summary-grid">
              <div><strong>{metrics.fileCount}</strong><span>files in view</span></div>
              <div><strong>{metrics.edgeCount}</strong><span>relationships</span></div>
              <div><strong>{uploadedProjectCount}</strong><span>{uploadCountLabel}</span></div>
            </div>
          </section>

          <section className="rail-section search-panel">
            <div className="eyebrow"><MagnifyingGlass size={13} /> FIND A THREAD</div>
            <div className="search-box">
              <MagnifyingGlass size={16} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Function, file, package..."
                aria-label="Search architecture"
              />
              {query ? <button type="button" className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button> : <kbd><Command size={11} /> K</kbd>}
            </div>
            {query && (
              <div className="search-results">
                {searchResults.length === 0 ? (
                  <div className="empty-search">No matching entities.</div>
                ) : (
                  searchResults.map((result) => (
                    <button type="button" className="search-result" key={result.id} onClick={() => selectSearchResult(result)}>
                      <span className={`result-glyph ${result.kind}`} />
                      <span className="result-copy"><strong>{result.label}</strong><small>{result.path ?? result.kind}{result.line ? ` · L${result.line}` : ''}</small></span>
                      <CaretRight size={13} />
                    </button>
                  ))
                )}
              </div>
            )}
          </section>

          <section className="rail-section filter-panel">
            <div className="eyebrow"><Target size={13} /> FOCUS CONTROL</div>
            <label className="field-label" htmlFor="focus-depth">Focus depth</label>
            <div className="focus-control">
              {[1, 2, 3].map((depth) => (
                <button type="button" key={depth} className={focusDepth === depth ? 'active' : ''} onClick={() => setFocusDepth(depth)}>{depth} hop{depth > 1 ? 's' : ''}</button>
              ))}
            </div>
            <div className="toggle-list">
              <label className="toggle-row"><input type="checkbox" checked={showDirectories} onChange={(event) => setShowDirectories(event.target.checked)} /><span className="toggle-indicator" /><span>Directory clusters</span></label>
              <label className="toggle-row"><input type="checkbox" checked={showPackages} onChange={(event) => setShowPackages(event.target.checked)} /><span className="toggle-indicator" /><span>External packages</span></label>
            </div>
            <button type="button" className="reset-button" onClick={resetView}><ArrowClockwise size={14} /> Reset view <kbd>R</kbd></button>
          </section>

          <div className="rail-footer">
            <span>JS / TS ONLY</span>
            <span>REV 0.1</span>
          </div>
        </aside>

        <section className="viewport-panel" aria-label="Interactive architecture map">
          <div className="viewport-toolbar">
            <div className="viewport-title">
              <span className="viewport-icon">{sourceIcon}</span>
              <div><strong>{projectName}</strong><span>{sourceLabel} · {metrics.nodeCount} entities · {metrics.edgeCount} relationships</span></div>
            </div>
            <div className="viewport-tools">
              <span className="coordinate-readout">{selectedNode ? displayPath(selectedNode) : 'NO FOCUS'}</span>
              <span className="view-mode-label">{viewMode === '2d' ? 'ORTHOGRAPHIC' : 'PERSPECTIVE'}</span>
            </div>
          </div>
          <div className="canvas-frame">
            {webglAvailable ? (
              <SceneErrorBoundary
                key={`${graph.sourceLabel}:${viewMode}`}
                fallback={<GraphFallback graph={graph} selectedId={selectedId} onSelect={setSelectedId} />}
              >
                <Suspense fallback={<CanvasLoadingState />}>
                  <AtlasCanvas
                    graph={graph}
                    selectedId={selectedId}
                    viewMode={viewMode}
                    focusDepth={focusDepth}
                    showDirectories={showDirectories}
                    showPackages={showPackages}
                    onSelect={(nodeId) => setSelectedId(nodeId || undefined)}
                  />
                </Suspense>
              </SceneErrorBoundary>
            ) : (
              <GraphFallback graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            <div className="canvas-overview" aria-label="Project overview">
              <span className="canvas-overview-label">PROJECT / {projectName}</span>
              <strong>{metrics.fileCount} files · {metrics.edgeCount} links</strong>
              <span>{focusDepth} hop focus · {viewMode === '2d' ? 'flat map' : 'depth map'}</span>
            </div>
            <div className="canvas-corner canvas-corner-tl"><span /> NODE FIELD / {viewMode.toUpperCase()}</div>
            <div className="canvas-corner canvas-corner-br">DRAG TO PAN · SCROLL TO ZOOM</div>
            <div className="canvas-legend">
              <span><i className="legend-dot directory" /> directories</span>
              <span><i className="legend-dot file" /> files</span>
              <span><i className="legend-dot package" /> packages</span>
              {selectedId && <span><i className="legend-dot signal" /> focus thread</span>}
            </div>
          </div>
        </section>

        <aside className="right-inspector" aria-label="Selected entity inspector">
          <div className="inspector-header">
            <div className="eyebrow"><Code size={13} /> ENTITY INSPECTOR</div>
            {selectedNode && <button type="button" className="icon-button" onClick={() => setSelectedId(undefined)} aria-label="Close inspector"><X size={15} /></button>}
          </div>
          {selectedNode ? (
            <div className="inspector-content">
              <div className="entity-heading">
                <span className={`entity-glyph ${selectedNode.kind}`} />
                <div><span>{nodeKindLabel(selectedNode.kind)}</span><h2>{selectedNode.label}</h2></div>
              </div>
              <code className="entity-path">{displayPath(selectedNode)}{selectedNode.line ? `:${selectedNode.line}` : ''}</code>
              <div className="entity-tags">
                {selectedNode.extension && <span>{selectedNode.extension}</span>}
                {selectedNode.exported && <span>EXPORTED</span>}
                {selectedNode.external && <span>EXTERNAL</span>}
                {selectedNode.kind === 'symbol' && <span>HEURISTIC LINKS</span>}
              </div>
              <div className="metric-strip">
                <div><strong>{selectedNode.metrics?.lineCount ?? selectedFunctions.length}</strong><span>{selectedNode.kind === 'file' ? 'lines' : 'signals'}</span></div>
                <div><strong>{dependencies.length.toString().padStart(2, '0')}</strong><span>outbound</span></div>
                <div><strong>{dependents.length.toString().padStart(2, '0')}</strong><span>inbound</span></div>
              </div>
              <RelationshipList title="Dependencies" items={dependencies} direction="outbound" onSelect={setSelectedId} />
              <RelationshipList title="Dependents" items={dependents} direction="inbound" onSelect={setSelectedId} />
              {selectedFunctions.length > 0 && (
                <section className="inspector-section">
                  <div className="section-heading"><span>Symbols in scope</span><span className="section-count">{selectedFunctions.length.toString().padStart(2, '0')}</span></div>
                  <div className="symbol-list">
                    {selectedFunctions.map((symbol) => (
                      <button type="button" key={symbol.id} className="symbol-item" onClick={() => setSelectedId(symbol.id)}>
                        <BracketsCurly size={13} />
                        <span>{symbol.name}</span>
                        <small>L{symbol.line ?? '--'}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="inspector-empty">
              <div className="empty-crosshair"><Crosshair size={26} /></div>
              <h2>Pick a node.</h2>
              <p>Select a file, directory, or package to inspect what it imports and what depends on it.</p>
              <div className="empty-instructions"><span><kbd>⌘K</kbd> search</span><span><kbd>ESC</kbd> clear focus</span><span><kbd>R</kbd> reset view</span></div>
            </div>
          )}
          <div className="diagnostic-panel">
            <div className="section-heading"><span>Scan diagnostics</span><span className="section-count">{graph.diagnostics.length.toString().padStart(2, '0')}</span></div>
            {graph.diagnostics.slice(0, 3).map((diagnostic) => (
              <div className={`diagnostic ${diagnostic.severity}`} key={diagnostic.id}><Warning size={13} /><span>{diagnostic.message}</span></div>
            ))}
          </div>
        </aside>
      </div>

      <footer className={`statusbar ${scanState}`}>
        <div className="status-message"><span className="status-pulse" />{scanMessage}</div>
        <div className="status-stats"><span>{metrics.directoryCount} dirs</span><span>{metrics.fileCount} files</span><span>{metrics.packageCount} packages</span><span>{graph.diagnostics.length} diagnostics</span></div>
      </footer>
    </main>
  )
}

export default App
