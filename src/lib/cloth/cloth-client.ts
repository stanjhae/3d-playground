import type { CanonicalPattern } from '../pattern/pattern-document.ts'
import { hashPattern } from '../pattern/pattern-hash.ts'
import type { ColliderBuild } from './colliders.ts'
import type { DrapeMessage, DrapeRequest, DrapedMesh } from './drape-job.ts'
import { SOLVER_VERSION } from './solver.ts'

/**
 * Drapes patterns in the cloth worker for the studio. Only the newest
 * request runs: asking again ends the worker mid-drape and starts afresh,
 * and the older promise rejects with `DrapeCancelled`. Finished drapes are
 * kept in memory by pattern hash, body and solver version, so undo and redo
 * come back at once.
 */
export class DrapeCancelled extends Error {
  constructor() {
    super('The drape was replaced by a newer one')
    this.name = 'DrapeCancelled'
  }
}

type WorkerLike = {
  postMessage: (message: DrapeRequest) => void
  terminate: () => void
  onmessage: ((event: MessageEvent<DrapeMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

const CACHE_LIMIT = 12

export function createDrapeClient({
  spawn = () => new Worker(new URL('../../workers/cloth.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
}: { spawn?: () => WorkerLike } = {}) {
  const cache = new Map<string, DrapedMesh>()
  let worker: WorkerLike | null = null
  let job = 0
  let pending: { job: number; reject: (error: Error) => void } | null = null
  /** The drape running now: asking for the same pattern again joins it rather than cancelling it. */
  let inflight: { key: string; promise: Promise<DrapedMesh>; listeners: Set<(fraction: number) => void> } | null = null
  /** How many drapes actually ran (the e2e checks a reload runs none). */
  let runs = 0

  function stop() {
    worker?.terminate()
    worker = null
    pending?.reject(new DrapeCancelled())
    pending = null
    inflight = null
  }

  async function keyFor(pattern: CanonicalPattern, build: ColliderBuild) {
    return `${await hashPattern({ pattern })}|${build}|${SOLVER_VERSION}`
  }

  return {
    get runs() {
      return runs
    },

    /** A finished drape for this pattern, if one is cached. */
    async cached({ pattern, build = 'neutral' }: { pattern: CanonicalPattern; build?: ColliderBuild }) {
      return cache.get(await keyFor(pattern, build)) ?? null
    },

    /** Keep a drape that came from elsewhere (the server's stored mesh). */
    async remember({ pattern, build = 'neutral', mesh }: { pattern: CanonicalPattern; build?: ColliderBuild; mesh: DrapedMesh }) {
      cache.set(await keyFor(pattern, build), mesh)
    },

    async drape({
      pattern,
      build = 'neutral',
      onProgress,
    }: {
      pattern: CanonicalPattern
      build?: ColliderBuild
      onProgress?: (fraction: number) => void
    }): Promise<DrapedMesh> {
      const key = await keyFor(pattern, build)
      const hit = cache.get(key)

      if (hit) {
        return hit
      }

      // Two views of one garment (or a publish) asking for the same drape share it.
      if (inflight?.key === key) {
        if (onProgress) {
          inflight.listeners.add(onProgress)
        }

        return inflight.promise
      }

      job += 1
      const mine = job
      // A drape of anything else is now stale.
      stop()
      runs += 1
      const current = spawn()
      worker = current
      const listeners = new Set<(fraction: number) => void>(onProgress ? [onProgress] : [])
      const report = (fraction: number) => listeners.forEach((listener) => listener(fraction))

      const promise = new Promise<DrapedMesh>((resolve, reject) => {
        pending = { job: mine, reject }

        current.onmessage = (event) => {
          const message = event.data

          if (message.job !== mine) {
            return
          }

          if (message.type === 'progress') {
            report(message.fraction)
            return
          }

          pending = null
          current.terminate()

          if (worker === current) {
            worker = null
          }

          if (message.type === 'failed') {
            reject(new Error(message.message))
            return
          }

          cache.set(key, message.mesh)

          while (cache.size > CACHE_LIMIT) {
            cache.delete(cache.keys().next().value!)
          }

          report(1)
          resolve(message.mesh)
        }

        current.onerror = (event) => {
          pending = null
          current.terminate()
          reject(new Error(event.message || 'The cloth worker stopped'))
        }

        current.postMessage({ type: 'drape', job: mine, pattern, build })
      })

      inflight = { key, promise, listeners }
      // Settled either way, it's no longer the one running.
      void promise.then(
        () => {
          if (inflight?.promise === promise) inflight = null
        },
        () => {
          if (inflight?.promise === promise) inflight = null
        },
      )
      return promise
    },

    /** Ends any drape, including one still being prepared. */
    cancel() {
      job += 1
      stop()
    },
  }
}

export type DrapeClient = ReturnType<typeof createDrapeClient>
