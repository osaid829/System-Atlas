import { describe, expect, it } from 'vitest'
import { projectNameFromPath } from './project-name'

describe('projectNameFromPath', () => {
  it('uses the uploaded folder root when a relative path is available', () => {
    expect(projectNameFromPath('atlas-app/src/App.tsx', 14)).toBe('atlas-app')
  })

  it('uses a single file name when a folder path is unavailable', () => {
    expect(projectNameFromPath('dashboard.tsx', 1)).toBe('dashboard')
  })

  it('uses a neutral source-set label for multiple loose files', () => {
    expect(projectNameFromPath('App.tsx', 4)).toBe('selected source set')
  })
})
