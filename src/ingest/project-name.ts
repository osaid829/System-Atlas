export function projectNameFromPath(path: string, fileCount: number): string {
  const normalizedPath = path.replaceAll('\\', '/').replace(/^\/+/, '')
  const firstSegment = normalizedPath.split('/')[0]
  if (firstSegment && normalizedPath.includes('/')) return firstSegment
  if (fileCount === 1 && firstSegment) return firstSegment.replace(/\.[^/.]+$/, '')
  return 'selected source set'
}
