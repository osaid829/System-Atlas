import { describe, expect, it } from 'vitest'
import { parseSourceFiles } from './source-parser'

describe('parseSourceFiles', () => {
  it('extracts source files, symbols, relative imports, and packages', () => {
    const graph = parseSourceFiles([
      {
        path: 'src/main.ts',
        content: `import { helper } from './helper';\nimport React from 'react';\nexport function main() { return helper(); }`,
      },
      {
        path: 'src/helper.ts',
        content: 'export function helper() { return true }',
      },
    ], 'local project scan', 'atlas-fixture')

    expect(graph.projectName).toBe('atlas-fixture')
    expect(graph.nodes.some((node) => node.id === 'file:src/main.ts')).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'symbol:src/main.ts:main')).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'package:react')).toBe(true)
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'file:src/main.ts', target: 'file:src/helper.ts', kind: 'imports' }))
  })

  it('keeps unresolved relative imports visible as diagnostics', () => {
    const graph = parseSourceFiles([
      {
        path: 'src/main.ts',
        content: "import { missing } from './missing';\nexport const main = () => missing",
      },
    ])

    expect(graph.diagnostics.some((diagnostic) => diagnostic.message.includes('Could not resolve ./missing'))).toBe(true)
  })
})
