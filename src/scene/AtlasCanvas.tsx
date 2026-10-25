import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useEffect, useMemo } from 'react'
import type { AtlasGraph, GraphEdge, GraphNode } from '../domain/graph'
import { getFocusResult } from '../domain/graph-queries'
import { computeGraphLayout, type GraphLayout, type LayoutPoint } from '../layout/force-layout'

export type ViewMode = '2d' | '3d'

interface AtlasCanvasProps {
  graph: AtlasGraph
  selectedId?: string
  viewMode: ViewMode
  focusDepth: number
  showDirectories: boolean
  showPackages: boolean
  onSelect: (nodeId: string) => void
}

interface SceneProps extends AtlasCanvasProps {
  layout: GraphLayout
  visualSelectedId?: string
}

const colors = {
  canvas: '#0a0c0e',
  text: '#e5e7e4',
  muted: '#596067',
  grid: '#23282c',
  signal: '#ff5b5b',
  file: '#b5bec2',
  directory: '#778187',
  package: '#d7a76d',
}

function positionFor(point: LayoutPoint, viewMode: ViewMode): [number, number, number] {
  if (viewMode === '2d') return [point.x, point.y, point.z]
  return [point.x, point.y, Math.sin(point.x + point.y) * 0.35 + point.z]
}

function nodeOpacity(
  node: GraphNode,
  selectedId: string | undefined,
  focusNodeIds: Set<string>,
  showDirectories: boolean,
  showPackages: boolean,
): number {
  if (node.kind === 'directory' && !showDirectories) return 0
  if (node.kind === 'package' && !showPackages) return 0
  if (!selectedId) return node.kind === 'directory' ? 0.82 : 1
  if (node.id === selectedId) return 1
  if (focusNodeIds.has(node.id)) return 0.94
  return 0.12
}

function nodeColor(node: GraphNode, selectedId?: string): string {
  if (node.id === selectedId) return colors.signal
  if (node.kind === 'directory') return colors.directory
  if (node.kind === 'package') return colors.package
  return colors.file
}

function NativeLineSegments({
  points,
  color,
  opacity,
}: {
  points: ReadonlyArray<[number, number, number]>
  color: string
  opacity: number
}) {
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry()
    nextGeometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
    return nextGeometry
  }, [points])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  )
}

function NodeVisual({
  point,
  viewMode,
  selectedId,
  focusNodeIds,
  showDirectories,
  showPackages,
  onSelect,
}: {
  point: LayoutPoint
  viewMode: ViewMode
  selectedId?: string
  focusNodeIds: Set<string>
  showDirectories: boolean
  showPackages: boolean
  onSelect: (nodeId: string) => void
}) {
  const { node } = point
  const opacity = nodeOpacity(node, selectedId, focusNodeIds, showDirectories, showPackages)
  if (opacity === 0) return null

  const position = positionFor(point, viewMode)
  const scale = selectedId === node.id ? 1.1 : 1
  const nodeSize = node.kind === 'directory' ? point.radius * 1.6 : node.kind === 'package' ? point.radius * 1.25 : point.radius * 1.45
  const nodeDepth = viewMode === '3d' ? nodeSize : 0.08

  return (
    <group
      position={position}
      scale={scale}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect(node.id)
      }}
    >
      <mesh>
        <boxGeometry args={[nodeSize, nodeSize, nodeDepth]} />
        <meshBasicMaterial
          color={nodeColor(node, selectedId)}
          transparent
          opacity={opacity}
          wireframe={node.kind === 'directory'}
        />
      </mesh>
    </group>
  )
}

function SceneLabels({
  layout,
  selectedId,
  showDirectories,
  showPackages,
  onSelect,
}: {
  layout: GraphLayout
  selectedId?: string
  showDirectories: boolean
  showPackages: boolean
  onSelect: (nodeId: string) => void
}) {
  const visiblePoints = [...layout.points.values()].filter((point) => {
    if (point.node.kind === 'directory' && !showDirectories) return false
    if (point.node.kind === 'package' && !showPackages) return false
    return true
  })
  const showContextLabels = visiblePoints.length <= 42
  const labels = visiblePoints.filter((point) => showContextLabels || point.id === selectedId)

  return (
    <div className="scene-label-layer" aria-label="Architecture node labels">
      {labels.map((point) => {
        const left = 50 + (point.x / 7.2) * 44
        const top = 50 - (point.y / 7.2) * 44
        const isSelected = point.id === selectedId
        return (
          <button
            type="button"
            key={point.id}
            className={isSelected ? 'scene-label active' : 'scene-label'}
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={() => onSelect(point.id)}
            title={point.node.path ?? point.node.label}
          >
            <span className="scene-label-kind">{point.node.kind}</span>
            <strong>{point.node.label}</strong>
            {point.node.path && point.node.path !== point.node.label && <span>{point.node.path}</span>}
          </button>
        )
      })}
    </div>
  )
}

function EdgeVisual({
  edge,
  layout,
  viewMode,
  selectedId,
  focusEdgeIds,
}: {
  edge: GraphEdge
  layout: GraphLayout
  viewMode: ViewMode
  selectedId?: string
  focusEdgeIds: Set<string>
}) {
  const source = layout.points.get(edge.source)
  const target = layout.points.get(edge.target)
  if (!source || !target) return null

  const isStructural = edge.kind === 'contains'
  const isFocused = focusEdgeIds.has(edge.id) || edge.source === selectedId || edge.target === selectedId
  const opacity = selectedId ? (isFocused ? 0.7 : 0.06) : isStructural ? 0.24 : 0.42
  const color = isStructural ? colors.grid : edge.kind === 'calls' ? '#927f6c' : colors.muted
  const points: [[number, number, number], [number, number, number]] = [
    positionFor(source, viewMode),
    positionFor(target, viewMode),
  ]

  return <NativeLineSegments points={points} color={color} opacity={opacity} />
}

function Scene({
  graph,
  layout,
  visualSelectedId,
  viewMode,
  focusDepth,
  showDirectories,
  showPackages,
  onSelect,
}: SceneProps) {
  const focusResult = useMemo(
    () => getFocusResult(graph, visualSelectedId, focusDepth),
    [focusDepth, graph, visualSelectedId],
  )
  const gridSegments = useMemo(() => {
    const gridSize = 7
    const segments: Array<[[number, number, number], [number, number, number]]> = []
    for (let coordinate = -gridSize; coordinate <= gridSize; coordinate += 1) {
      segments.push(
        [[-gridSize, coordinate, -0.35], [gridSize, coordinate, -0.35]],
        [[coordinate, -gridSize, -0.35], [coordinate, gridSize, -0.35]],
      )
    }
    return segments
  }, [])
  const gridPoints = useMemo(
    () => gridSegments.flat(),
    [gridSegments],
  )

  return (
    <>
      <ambientLight intensity={0.7} />
      <NativeLineSegments points={gridPoints} color={colors.grid} opacity={0.17} />
      {graph.edges.map((edge) => (
        <EdgeVisual
          key={edge.id}
          edge={edge}
          layout={layout}
          viewMode={viewMode}
          selectedId={visualSelectedId}
          focusEdgeIds={focusResult.edgeIds}
        />
      ))}
      {[...layout.points.values()].map((point) => (
        <NodeVisual
          key={point.id}
          point={point}
          viewMode={viewMode}
          selectedId={visualSelectedId}
          focusNodeIds={focusResult.nodeIds}
          showDirectories={showDirectories}
          showPackages={showPackages}
          onSelect={onSelect}
        />
      ))}
      <OrbitControls
        makeDefault
        enableRotate={viewMode === '3d'}
        enablePan
        enableZoom
        minDistance={3}
        maxDistance={28}
        minZoom={24}
        maxZoom={120}
      />
    </>
  )
}

export function AtlasCanvas({
  graph,
  selectedId,
  viewMode,
  focusDepth,
  showDirectories,
  showPackages,
  onSelect,
}: AtlasCanvasProps) {
  const layout = useMemo(() => computeGraphLayout(graph), [graph])
  const selectedNode = graph.nodes.find((node) => node.id === selectedId)
  const visualSelectedId = selectedNode?.kind === 'symbol' ? selectedNode.parentId : selectedId

  return (
    <>
      <Canvas
        orthographic={viewMode === '2d'}
        camera={viewMode === '2d' ? { position: [0, 0, 22], zoom: 52 } : { position: [0, 0, 18], fov: 46 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => onSelect('')}
      >
        <color attach="background" args={[colors.canvas]} />
        <Scene
          graph={graph}
          layout={layout}
          selectedId={selectedId}
          visualSelectedId={visualSelectedId}
          viewMode={viewMode}
          focusDepth={focusDepth}
          showDirectories={showDirectories}
          showPackages={showPackages}
          onSelect={onSelect}
        />
      </Canvas>
      <SceneLabels
        layout={layout}
        selectedId={visualSelectedId}
        showDirectories={showDirectories}
        showPackages={showPackages}
        onSelect={onSelect}
      />
    </>
  )
}
