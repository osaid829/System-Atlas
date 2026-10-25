const ignoredSegments = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'vendor',
])

export function shouldIgnorePath(path: string): boolean {
  return path.split('/').some((segment) => ignoredSegments.has(segment))
}
