import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  clearRecovery,
  indexedDbRecoveryStorage,
} from '../../lib/cloud-recovery'
import { createOwnedDesign } from '../../lib/flp-api/client'
import type { SaveController, SaveState } from '../../lib/save-controller'

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

const LABELS: Record<SaveState['status'], string> = {
  saved: 'Saved to cloud',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline — not saved',
  failed: 'Save failed',
  conflict: 'Changed elsewhere',
  'waiting-for-images': 'Waiting for images',
}

const quiet =
  'inline-flex min-h-9 items-center px-2 font-body text-xs tracking-[0.08em] uppercase underline-offset-4 hover:text-flv-accent hover:underline disabled:opacity-50'

export function CloudSaveStatus() {
  const navigate = useNavigate()
  const state = useCloudSaveStore((store) => store.state)
  const controller = useCloudSaveStore((store) => store.controller)
  const cloud = useEditorStore((store) => store.cloud)
  const local = useRecoveryStore((store) => store.local)
  const warning = useRecoveryStore((store) => store.warning)
  const [copying, setCopying] = useState(false)

  if (!state || !cloud) {
    return null
  }

  const settled = state.status === 'saved'

  return (
    <div className="flex flex-wrap items-center gap-2 font-body text-xs" role="status" aria-live="polite">
      <span className={settled ? 'text-flv-muted' : 'text-flv-accent'}>{LABELS[state.status]}</span>
      {!settled && local.status === 'kept' ? (
        <span className="text-flv-muted">· Kept on this device</span>
      ) : null}
      {state.status === 'conflict' ? (
        <>
          <button
            type="button"
            className={quiet}
            onClick={() => window.location.reload()}
          >
            Open cloud version
          </button>
          <button
            type="button"
            className={quiet}
            disabled={copying}
            onClick={() => {
              setCopying(true)
              void createOwnedDesign({
                request: {
                  mutationKey: crypto.randomUUID(),
                  title: `${cloud.title} (copy)`,
                  content: getCanonicalDocument(),
                },
              }).then((result) => {
                setCopying(false)

                if (result.ok) {
                  void navigate({ to: '/create', search: { cloud: result.data.designId, step: 'design' } })
                }
              })
            }}
          >
            Save mine as a copy
          </button>
        </>
      ) : settled ? null : (
        <button type="button" className={quiet} onClick={() => controller?.flush()}>
          Save now
        </button>
      )}
      {state.message ? <span className="w-full text-flv-muted">{state.message}</span> : null}
      {warning ? (
        <span role="alert" className="w-full text-flv-accent">
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
  const offer = useRecoveryStore((store) => store.offer)
  const designId = useRecoveryStore((store) => store.designId)
  const cloud = useEditorStore((store) => store.cloud)
  const ownerId = useSessionStore((store) => store.account?.userId ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!offer || !cloud || !ownerId || cloud.designId !== designId) {
    return null
  }

  const forget = async () => {
    const cleared = await clearRecovery({
      storage: useRecoveryStore.getState().storage,
      ownerId,
      designId: cloud.designId,
    })
    useRecoveryStore.setState({
      offer: null,
      warning: cleared.ok ? null : RECOVERY_WARNINGS[cleared.reason],
    })
  }

  const saveCopy = async () => {
    setBusy(true)
    setError(null)
    const result = await createOwnedDesign({
      request: {
        mutationKey: crypto.randomUUID(),
        title: `${cloud.title} (recovered)`,
        // An unsupported copy goes as written; the server decides.
        content: (offer.kind === 'unsupported' ? offer.record.document : offer.document) as CanonicalDocument,
      },
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
                useEditorStore.getState().recoverCanonical({ document: offer.document })
                useRecoveryStore.setState({ offer: null })
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
