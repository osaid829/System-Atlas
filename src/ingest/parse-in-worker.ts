import type { AtlasGraph } from '../domain/graph'
import type { SourceFileInput } from './source-parser'

interface WorkerSuccess {
  type: 'complete'
  graph: AtlasGraph
}

interface WorkerFailure {
  type: 'error'
  message: string
}

type WorkerResponse = WorkerSuccess | WorkerFailure

export function parseSourceFilesInWorker(
  inputs: SourceFileInput[],
  sourceLabel: string,
  projectName: string,
): Promise<AtlasGraph> {
  const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate()
      if (event.data.type === 'complete') resolve(event.data.graph)
      else reject(new Error(event.data.message))
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('The source parser worker could not complete.'))
    }
    worker.postMessage({ inputs, sourceLabel, projectName })
  })
}
