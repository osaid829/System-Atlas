import { describe, expect, it } from 'vitest'
import { createSampleGraph } from '../fixtures/sample-repository'
import { computeGraphLayout } from './force-layout'

describe('computeGraphLayout', () => {
  it('keeps visible points finite and within a stable camera range', () => {
    const layout = computeGraphLayout(createSampleGraph())
    const points = [...layout.points.values()]

    expect(points.length).toBeGreaterThan(0)
    expect(points.every((point) => [point.x, point.y, point.z].every(Number.isFinite))).toBe(true)
    expect(Math.max(...points.map((point) => Math.abs(point.x)), ...points.map((point) => Math.abs(point.y)))).toBeLessThanOrEqual(6.4)
  })
})
