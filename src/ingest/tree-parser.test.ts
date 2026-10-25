import { describe, expect, it } from 'vitest'
import { parseTreeText } from './tree-parser'

describe('parseTreeText', () => {
  it('parses an ASCII directory tree into directories, files, and contains edges', () => {
    const graph = parseTreeText(`root/\n├── src/\n│   ├── App.tsx\n│   └── main.tsx\n└── package.json`)

    expect(graph.nodes.find((node) => node.id === 'directory:root/src')).toBeDefined()
    expect(graph.nodes.find((node) => node.id === 'file:root/src/App.tsx')).toBeDefined()
    expect(graph.nodes.find((node) => node.id === 'file:root/package.json')).toBeDefined()
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'directory:root/src', target: 'file:root/src/App.tsx', kind: 'contains' }))
  })

  it('parses newline-separated paths and reports structure-only mode', () => {
    const graph = parseTreeText('src/\nsrc/features/\nsrc/features/parse.ts')

    expect(graph.sourceMode).toBe('structure')
    expect(graph.projectName).toBe('pasted structure')
    expect(graph.nodes.some((node) => node.id === 'file:src/features/parse.ts')).toBe(true)
    expect(graph.diagnostics.some((diagnostic) => diagnostic.id === 'tree:structure-only')).toBe(false)
  })

  it('reports an empty input without throwing', () => {
    const graph = parseTreeText('')
    expect(graph.nodes).toHaveLength(0)
    expect(graph.diagnostics[0]?.severity).toBe('warning')
  })
})
