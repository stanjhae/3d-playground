import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

import { useSessionStore } from '../../lib/auth/session-store'
import type { CanonicalDocument } from '../../lib/canonical-document'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import {
  type LocalCopyState,
  startCloudAutosave,
  startCloudRecovery,
} from '../../lib/cloud-autosave'
import {
  type RecoveryOffer,
  type RecoveryStorage,
  RECOVERY_WARNINGS,
  RECOVERY_WRITER_ID,
  deleteRecovery,
  liveRecoveryOffer,
  indexedDbRecoveryStorage,
} from '../../lib/cloud-recovery'
import { type CopyAttempt, createCopyAttempt } from '../../lib/copy-attempt'
import { createOwnedDesign } from '../../lib/flp-api/client'
import type { SaveController, SaveState } from '../../lib/save-controller'
import { saveIndicator } from '../../lib/save-indicator'
import { saveIndicatorClass } from '../../lib/studio-chrome'
import { cn } from '../../lib/cn'
import { trackAssumption } from '../../lib/assumption-events'

/** Latest cloud save state for the open design; null outside cloud mode. */
export const useCloudSaveStore = create<{
  state: SaveState | null
  controller: SaveController | null
}>(() => ({ state: null, controller: null }))

/**
 * Local recovery for the open cloud design (S05 #174). While `offer` is
 * pending nothing is written locally, so the found copy survives until the
 * creator chooses.
 */
export const useRecoveryStore = create<{
  storage: RecoveryStorage
  designId: string | null
  offer: Exclude<RecoveryOffer, { kind: 'none' }> | null
  local: LocalCopyState
  warning: string | null
}>(() => ({
  storage: indexedDbRecoveryStorage,
  designId: null,
  offer: null,
  local: { status: 'none' },
  warning: null,
}))

/**
 * Autosave the open cloud design (S04 #173). One controller per loaded
 * design; cancelled on unmount, design change, reload (restore) or
 * account change.
 */
export function useCloudAutosave() {
  const designId = useEditorStore((state) => state.cloud?.designId ?? null)
  const cloudLoad = useEditorStore((state) => state.cloudLoad)
  const accountEpoch = useSessionStore((state) => state.accountEpoch)

  useEffect(() => {
    if (!designId) {
      return
    }

    const autosave = startCloudAutosave({
      designId,
      onState: (state, controller) => useCloudSaveStore.setState({ state, controller }),
    })
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (autosave.controller.getState().status !== 'saved') {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)

    return () => {
      autosave.stop()
      window.removeEventListener('beforeunload', warnBeforeLeaving)
      useCloudSaveStore.setState({ state: null, controller: null })
    }
  }, [designId, cloudLoad, accountEpoch])


  const ownerId = useSessionStore((state) => state.account?.userId ?? null)
  const controller = useCloudSaveStore((state) => state.controller)
  const offerPending = useRecoveryStore(
    (state) => state.designId === designId && state.offer !== null,
  )

  useEffect(() => {
    if (!designId || !ownerId || !controller || offerPending) {
      return
    }

    const recovery = startCloudRecovery({
      designId,
      ownerId,
      storage: useRecoveryStore.getState().storage,
      controller,
      onLocal: (local) =>
        useRecoveryStore.setState({
          local,
          warning: local.status === 'failed' ? RECOVERY_WARNINGS[local.reason] : null,
        }),
    })

    return () => {
      recovery.stop()
      useRecoveryStore.setState({ local: { status: 'none' } })
    }
  }, [designId, ownerId, controller, offerPending])
}

/** One copy attempt per open design, kept across renders (S06 #175). */
function useCopyAttempt({ designId }: { designId: string | null }) {
  const current = useRef<{ designId: string | null; attempt: CopyAttempt } | null>(null)

  return () => {
    if (!current.current || current.current.designId !== designId) {
      current.current = {
        designId,
        attempt: createCopyAttempt({ create: (request) => createOwnedDesign({ request }) }),
      }
    }

    return current.current.attempt
  }
}

const COPY_FAILED = 'The copy could not be saved. Your changes are still here; try again.'

const quiet =
  'inline-flex min-h-9 items-center px-2 font-body text-xs tracking-[0.08em] uppercase underline-offset-4 hover:text-flv-accent hover:underline disabled:opacity-50'

/**
 * The one save indicator, in the studio header (third outside test pass).
 * Fixed in size: its words change, the header around it never moves, so a
 * click aimed at a button beside it lands there. What needs the creator (a
 * conflict, a save that stopped, no local copy) is `CloudSaveProblem`.
 */
export function CloudSaveStatus() {
  const state = useCloudSaveStore((store) => store.state)
  const controller = useCloudSaveStore((store) => store.controller)
  const cloud = useEditorStore((store) => store.cloud)
  const local = useRecoveryStore((store) => store.local)

  if (!state || !cloud) {
    return null
  }

  const indicator = saveIndicator({ state, keptLocally: local.status === 'kept' })
  const description = [indicator.label, indicator.detail, indicator.description].filter(Boolean).join('. ')

  return (
    <div
      className={saveIndicatorClass()}
      role="status"
      aria-live="polite"
      data-hint-anchor="saving"
      data-save-indicator
      title={description}
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <span
          className={cn('truncate', {
            'text-flv-muted': indicator.tone === 'quiet',
            'text-flv-ink': indicator.tone === 'busy',
            'text-flv-accent': indicator.tone === 'problem',
          })}
        >
          {indicator.label}
        </span>
        {/* Always laid out, empty or not, so the indicator keeps one height. */}
        <span className="min-h-[1.2em] truncate text-[11px] text-flv-muted">{indicator.detail}</span>
      </span>
      {/* The slot is kept even when hidden, for the same reason. */}
      <button
        type="button"
        className={cn(quiet, 'shrink-0', { invisible: !indicator.canRetryNow })}
        tabIndex={indicator.canRetryNow ? undefined : -1}
        aria-hidden={indicator.canRetryNow ? undefined : true}
        onClick={() => controller?.flush()}
      >
        Try again
      </button>
    </div>
  )
}

/**
 * Save problems that wait on the creator, below the header's controls: a
 * newer version saved elsewhere, a save that stopped, or no local copy.
 */
export function CloudSaveProblem() {
  const navigate = useNavigate()
  const state = useCloudSaveStore((store) => store.state)
  const cloud = useEditorStore((store) => store.cloud)
  const warning = useRecoveryStore((store) => store.warning)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const copyAttempt = useCopyAttempt({ designId: cloud?.designId ?? null })

  if (!state || !cloud) {
    return null
  }

  const indicator = saveIndicator({ state, keptLocally: false })

  if (!indicator.needsAction && !warning) {
    return null
  }

  return (
    <div className="flex flex-col gap-1 font-body text-xs">
      {indicator.needsAction ? (
        <div role="status" className="flex flex-wrap items-center gap-2">
          <span className="text-flv-ink">{state.message ?? indicator.label}</span>
          {state.status === 'conflict' ? (
            <>
              <button type="button" className={quiet} onClick={() => window.location.reload()}>
                Open cloud version
              </button>
              <button
                type="button"
                className={quiet}
                disabled={copying}
                onClick={() => {
                  setCopying(true)
                  setCopyError(null)
                  // One attempt per design: a retry or second click replays
                  // the same create, never a second copy (S06 #175).
                  void copyAttempt()
                    .run({ title: `${cloud.title} (copy)`, content: getCanonicalDocument() })
                    .then((result) => {
                      setCopying(false)

                      if (result.ok) {
                        void navigate({ to: '/create', search: { cloud: result.data.designId, step: 'design' } })
                      } else {
                        setCopyError(COPY_FAILED)
                      }
                    })
                }}
              >
                Save mine as a copy
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {copyError && state.status === 'conflict' ? (
        <span role="alert" className="text-flv-accent">
          {copyError}
        </span>
      ) : null}
      {warning ? (
        <span role="alert" className="text-flv-accent">
          {warning}
        </span>
      ) : null}
    </div>
  )
}

const OFFER_COPY: Record<NonNullable<ReturnType<typeof useRecoveryStore.getState>['offer']>['kind'], string> = {
  recover: 'This browser has changes to this design that never reached the cloud.',
  stale:
    'This browser has changes to an older version of this design. The cloud version changed since, so they cannot simply be applied. Opening the cloud version discards them.',
  unsupported:
    'This browser has changes saved by a different version of the app. They cannot be opened here. Opening the cloud version discards them.',
}

/** Recover / discard / save-as-copy for local work found on open (S05 #174). */
export function RecoveryPrompt() {
  const navigate = useNavigate()
  const rawOffer = useRecoveryStore((store) => store.offer)
  const designId = useRecoveryStore((store) => store.designId)
  const cloud = useEditorStore((store) => store.cloud)
  const ownerId = useSessionStore((store) => store.account?.userId ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveStatus = useCloudSaveStore((store) => store.state?.status ?? 'saved')
  const copyAttempt = useCopyAttempt({ designId: cloud?.designId ?? null })

  if (!rawOffer || !cloud || !ownerId || cloud.designId !== designId) {
    return null
  }

  // Edits made, or saved, while this prompt is open make the local copy
  // out of date: never let Recover overwrite them.
  const offer = liveRecoveryOffer({
    offer: rawOffer,
    cloudHeadSeq: cloud.headSeq,
    hasUnsavedEdits: saveStatus !== 'saved',
  })

  // Answering the offer deletes that record only, so it is not offered
  // again; other tabs' copies of this design are left alone.
  const forget = async () => {
    const cleared = await deleteRecovery({
      storage: useRecoveryStore.getState().storage,
      keys: [offer.key],
    })
    useRecoveryStore.setState({
      offer: null,
      warning: cleared.ok ? null : RECOVERY_WARNINGS[cleared.reason],
    })
  }

  const saveCopy = async () => {
    setBusy(true)
    setError(null)
    const result = await copyAttempt().run({
      title: `${cloud.title} (recovered)`,
      // An unsupported copy goes as written; the server decides.
      content: (offer.kind === 'unsupported' ? offer.record.document : offer.document) as CanonicalDocument,
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.message || 'The copy could not be saved. Your local changes are still kept.')
      return
    }

    await forget()
    void navigate({ to: '/create', search: { cloud: result.data.designId, step: 'design' } })
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="recovery-title"
      className="flex max-w-md flex-col gap-2 border border-flv-accent bg-flv-paper p-3 font-body text-sm"
    >
      <p id="recovery-title" className="text-flv-ink">
        {OFFER_COPY[offer.kind]}{' '}
        <span className="text-flv-muted">
          Kept {new Date(offer.record.savedAt).toLocaleString()}.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {offer.kind === 'recover' ? (
          <>
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => {
                // Re-check at click time: an autosave may have just landed.
                const current = useEditorStore.getState().cloud
                const now = liveRecoveryOffer({
                  offer,
                  cloudHeadSeq: current?.headSeq ?? -1,
                  hasUnsavedEdits: useCloudSaveStore.getState().state?.status !== 'saved',
                })

                if (now.kind !== 'recover') {
                  return
                }

                useEditorStore.getState().recoverCanonical({ document: now.document })
                useRecoveryStore.setState({ offer: null })
                // The recovered work is kept again under this tab's writer
                // once the offer closes, so the old record goes: it must not
                // be offered twice. This tab's own record is replaced by its
                // next write instead, never deleted after it.
                if (now.record.writerId !== RECOVERY_WRITER_ID) {
                  void deleteRecovery({ storage: useRecoveryStore.getState().storage, keys: [now.key] })
                }
                void trackAssumption({ name: 'recovery_used' })
              }}
            >
              Recover unsaved changes
            </button>
            <button type="button" className={quiet} disabled={busy} onClick={() => void forget()}>
              Discard
            </button>
          </>
        ) : (
          <>
            <button type="button" className={quiet} disabled={busy} onClick={() => void forget()}>
              Open cloud version
            </button>
            <button type="button" className={quiet} disabled={busy} onClick={() => void saveCopy()}>
              Save mine as a copy
            </button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-flv-accent">
          {error}
        </p>
      ) : null}
    </div>
  )
}
