import type { CanonicalDocument } from './canonical-document.ts'
import { CANONICAL_PANEL_IDS } from './canonical-document.ts'
import type { FlpResult } from './flp-api/client.ts'
import type { VersionResponse } from './flp-api/contract.ts'
import { isLibraryAssetId } from './library-assets.ts'

/**
 * Cloud autosave (FLP S04 #173), as a pure state machine with injected
 * I/O so its guarantees are testable:
 * - saves 2s after the last change, or at once on flush (Save);
 * - one request in flight; newer revisions coalesce into one pending save;
 * - one mutation key per revision, reused on retry;
 * - only the exact revision sent is acknowledged as saved;
 * - a stale base (409) becomes `conflict` and stops; nothing is overwritten;
 * - cancel (navigation, account switch) drops late responses;
 * - a named checkpoint (S07 #176) waits its turn behind any save in flight
 *   and moves the same head, so autosave never races it;
 * - settle and hold let a restore (S08 #177) save or freeze work first.
 */

export type SaveStatus =
  | 'saved'
  | 'unsaved'
  | 'saving'
  | 'offline'
  | 'failed'
  | 'conflict'
  | 'waiting-for-images'

export type SaveState = {
  status: SaveStatus
  /** Last revision the cloud acknowledged. */
  savedRevision: number
  headSeq: number
  message: string | null
}

export type SaveRequest = {
  designId: string
  baseSeq: number
  mutationKey: string
  revision: number
  document: CanonicalDocument
  /** Autosave unless a named checkpoint. */
  kind?: 'autosave' | 'checkpoint'
  label?: string
}

export type SaveControllerOptions = {
  designId: string
  headSeq: number
  revision: number
  save: (request: SaveRequest) => Promise<FlpResult<VersionResponse>>
  onAcknowledged?: (ack: { headSeq: number; revision: number }) => void
  newKey?: () => string
  debounceMs?: number
  retryMs?: number
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

const CONFLICT_MESSAGE =
  'This design changed somewhere else. Open the cloud version or save yours as a copy.'

/** Library graphics ship with the app; anything else must be uploaded first. */
export function imagesReady({ document }: { document: CanonicalDocument }) {
  return CANONICAL_PANEL_IDS.every((panel) =>
    document.panels[panel].layers.every(
      (layer) => layer.kind !== 'image' || isLibraryAssetId({ assetId: layer.assetId }),
    ),
  )
}

export function createSaveController(options: SaveControllerOptions) {
  const {
    designId,
    save,
    onAcknowledged,
    newKey = () => crypto.randomUUID(),
    debounceMs = 2000,
    retryMs = 4000,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options

  let state: SaveState = {
    status: 'saved',
    savedRevision: options.revision,
    headSeq: options.headSeq,
    message: null,
  }
  let latest: { revision: number; document: CanonicalDocument } | null = null
  let inFlight = false
  let timer: unknown = null
  let generation = 0
  let held = false
  let idleWaiters: Array<() => void> = []
  const keys = new Map<number, string>()
  const listeners = new Set<(next: SaveState) => void>()

  function emit(patch: Partial<SaveState>) {
    state = { ...state, ...patch }

    for (const listener of listeners) {
      listener(state)
    }
  }

  function schedule(ms: number) {
    if (timer !== null) {
      clearTimer(timer)
    }

    timer = setTimer(() => {
      timer = null
      void send()
    }, ms)
  }

  function keyFor(revision: number) {
    let key = keys.get(revision)

    if (!key) {
      key = newKey()
      keys.set(revision, key)
    }

    return key
  }

  function settleInFlight() {
    inFlight = false
    const waiters = idleWaiters
    idleWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  /** Resolves once no request is in flight. */
  function whenIdle() {
    return inFlight
      ? new Promise<void>((resolve) => {
          idleWaiters.push(resolve)
        })
      : Promise.resolve()
  }

  /** After an acknowledgement: save anything newer, else report saved. */
  function afterAcknowledged({ revision }: { revision: number }) {
    if (latest && latest.revision > revision) {
      emit({ status: 'unsaved' })
      schedule(0)
    } else {
      emit({ status: 'saved' })
    }
  }

  async function send() {
    if (inFlight || held || state.status === 'conflict' || !latest) {
      return
    }

    if (latest.revision <= state.savedRevision) {
      emit({ status: 'saved', message: null })
      return
    }

    if (!imagesReady({ document: latest.document })) {
      emit({ status: 'waiting-for-images', message: 'Images must finish uploading before this design can save.' })
      return
    }

    const sent = latest
    const mine = generation
    inFlight = true
    emit({ status: 'saving', message: null })

    const result = await save({
      designId,
      baseSeq: state.headSeq,
      mutationKey: keyFor(sent.revision),
      revision: sent.revision,
      document: sent.document,
    })

    if (mine !== generation) {
      return
    }

    settleInFlight()

    if (result.ok) {
      keys.delete(sent.revision)
      emit({ savedRevision: sent.revision, headSeq: result.data.seq, message: null })
      onAcknowledged?.({ headSeq: result.data.seq, revision: sent.revision })
      afterAcknowledged({ revision: sent.revision })
      return
    }

    if (result.code === 'account-changed') {
      cancel()
      return
    }

    if (result.code === 'conflict') {
      emit({ status: 'conflict', message: CONFLICT_MESSAGE })
      return
    }

    if (result.code === 'network') {
      emit({ status: 'offline', message: 'Offline. Changes will save when the connection is back.' })
      schedule(retryMs)
      return
    }

    emit({ status: 'failed', message: result.message })
  }

  /** Call on every committed change (store revision). */
  function notify({ revision, document }: { revision: number; document: CanonicalDocument }) {
    if (revision <= state.savedRevision && !inFlight) {
      return
    }

    latest = { revision, document }

    if (state.status === 'conflict') {
      return
    }

    if (!inFlight) {
      emit({ status: imagesReady({ document }) ? 'unsaved' : 'waiting-for-images' })
    }

    schedule(debounceMs)
  }

  /** Save now (the Save button). */
  function flush() {
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }

    void send()
  }

  /** Stop without marking anything saved; late responses are ignored. */
  function cancel() {
    generation += 1

    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }

    settleInFlight()
  }

  /**
   * Save `document` (the editor at `revision`) as a named checkpoint. Waits
   * for any save in flight so both share one compare-and-swap chain.
   */
  async function checkpoint({
    label,
    revision,
    document,
  }: {
    label: string
    revision: number
    document: CanonicalDocument
  }): Promise<FlpResult<VersionResponse>> {
    while (inFlight) {
      await whenIdle()
    }

    if (state.status === 'conflict') {
      return { ok: false, code: 'conflict', message: CONFLICT_MESSAGE, headSeq: null }
    }

    if (!imagesReady({ document })) {
      return { ok: false, code: 'invalid', message: 'Images must finish uploading before this design can save.' }
    }

    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }

    const mine = generation
    inFlight = true
    emit({ status: 'saving', message: null })

    const result = await save({
      designId,
      baseSeq: state.headSeq,
      mutationKey: newKey(),
      revision,
      document,
      kind: 'checkpoint',
      label,
    })

    if (mine !== generation) {
      return result
    }

    settleInFlight()

    if (result.ok) {
      const savedRevision = Math.max(state.savedRevision, revision)
      keys.delete(revision)
      emit({ savedRevision, headSeq: result.data.seq, message: null })
      onAcknowledged?.({ headSeq: result.data.seq, revision })
      afterAcknowledged({ revision: savedRevision })
      return result
    }

    if (result.code === 'account-changed') {
      cancel()
    } else if (result.code === 'conflict') {
      emit({ status: 'conflict', message: CONFLICT_MESSAGE })
    } else if (latest && latest.revision > state.savedRevision) {
      // The checkpoint failed; pending edits still autosave.
      emit({ status: 'unsaved' })
      schedule(debounceMs)
    } else {
      emit({ status: 'saved' })
    }

    return result
  }

  /**
   * Save everything now and wait for the outcome: `saved`, or why not
   * (`offline`, `failed`, `conflict`, `waiting-for-images`).
   */
  async function settle() {
    // Bounded: each round saves the newest revision seen so far.
    for (let round = 0; round < 5; round += 1) {
      await whenIdle()

      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }

      await send()

      if (!inFlight && state.status !== 'unsaved' && state.status !== 'saving') {
        break
      }
    }

    return state
  }

  /**
   * Stop starting saves (pending edits stay pending) and wait for the one
   * in flight, so the head is known. `release` resumes.
   */
  async function hold() {
    held = true

    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }

    await whenIdle()
    return state
  }

  function release() {
    held = false

    if (latest && latest.revision > state.savedRevision && state.status !== 'conflict') {
      emit({ status: 'unsaved' })
      schedule(debounceMs)
    }
  }

  return {
    notify,
    flush,
    cancel,
    checkpoint,
    settle,
    hold,
    release,
    getState: () => state,
    subscribe(listener: (next: SaveState) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type SaveController = ReturnType<typeof createSaveController>
