import { parseSourceFiles, type SourceFileInput } from './source-parser'

interface WorkerRequest {
  inputs: SourceFileInput[]
  sourceLabel: string
  projectName: string
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const graph = parseSourceFiles(event.data.inputs, event.data.sourceLabel, event.data.projectName)
    self.postMessage({ type: 'complete', graph })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'The source parser failed.',
    })
  }
}
