import { describe, expect, it } from 'vitest'
import { createSampleGraph } from '../fixtures/sample-repository'
import {
  getConnectionPath,
  getDependencies,
  getDependents,
  getFocusResult,
  getSearchResults,
} from './graph-queries'

describe('graph queries', () => {
  const graph = createSampleGraph()
  const appId = 'file:src/app/App.tsx'
  const queryId = 'file:src/graph/queries.ts'

  it('returns imports and dependents with the documented direction', () => {
    expect(getDependencies(graph, appId).map((node) => node.label)).toContain('queries.ts')
    expect(getDependents(graph, queryId).map((node) => node.label)).toContain('App.tsx')
  })

  it('builds a two-sided focus neighborhood', () => {
    const focus = getFocusResult(graph, appId, 1)
    expect(focus.nodeIds.has(appId)).toBe(true)
    expect(focus.outboundNodeIds.has(queryId)).toBe(true)
    expect(focus.edgeIds.size).toBeGreaterThan(0)
  })

  it('finds symbols and returns a connection path', () => {
    const searchResults = getSearchResults(graph, 'getFocusSubgraph')
    expect(searchResults[0]?.id).toBe('symbol:src/graph/queries.ts:getFocusSubgraph')

    const path = getConnectionPath(graph, appId, 'file:src/shared/fileReader.ts')
    expect(path[0]).toBe(appId)
    expect(path.at(-1)).toBe('file:src/shared/fileReader.ts')
  })
})
