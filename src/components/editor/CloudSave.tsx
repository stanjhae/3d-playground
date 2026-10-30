import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { create } from 'zustand'

import { useSessionStore } from '../../lib/auth/session-store'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import { startCloudAutosave } from '../../lib/cloud-autosave'
import { createOwnedDesign } from '../../lib/flp-api/client'
import type { SaveController, SaveState } from '../../lib/save-controller'

/** Latest cloud save state for the open design; null outside cloud mode. */
export const useCloudSaveStore = create<{
  state: SaveState | null
  controller: SaveController | null
}>(() => ({ state: null, controller: null }))

/**
 * Autosave the open cloud design (S04 #173). One controller per design;
 * cancelled on unmount, design change or account change.
 */
export function useCloudAutosave() {
  const designId = useEditorStore((state) => state.cloud?.designId ?? null)
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
  }, [designId, accountEpoch])
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
  const [copying, setCopying] = useState(false)

  if (!state || !cloud) {
    return null
  }

  const settled = state.status === 'saved'

  return (
    <div className="flex flex-wrap items-center gap-2 font-body text-xs" role="status" aria-live="polite">
      <span className={settled ? 'text-flv-muted' : 'text-flv-accent'}>{LABELS[state.status]}</span>
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
    </div>
  )
}
