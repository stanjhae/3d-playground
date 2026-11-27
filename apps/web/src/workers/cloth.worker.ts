/// <reference lib="webworker" />
import { type DrapeRequest, runDrapeJob } from '../lib/cloth/drape-job.ts'

/**
 * The cloth solver off the main thread. One job at a time: the studio
 * cancels a stale drape by ending this worker and starting a new one.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<DrapeRequest>) => {
  if (event.data?.type === 'drape') {
    runDrapeJob(event.data, (message, transfer) => scope.postMessage(message, transfer ?? []))
  }
}
