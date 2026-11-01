import { accountGuard } from './auth/session-store.ts'
import {
  RECOVERY_WRITER_ID,
  type RecoveryStorage,
  type RecoveryWriteResult,
  type StorageFailure,
  clearRecovery,
  writeRecovery,
} from './cloud-recovery.ts'
import { getCanonicalDocument, useEditorStore } from './editor-store.ts'
import { saveDesignVersion } from './flp-api/client.ts'
import {
  type SaveController,
  type SaveControllerOptions,
  type SaveState,
  createSaveController,
} from './save-controller.ts'
import { trackAssumptionOnce } from './assumption-events.ts'

/**
 * Binds the editor store to a save controller for one open cloud design
 * (S04 #173): every committed revision is offered for saving, and each
 * acknowledgement moves the store's cloud head. Returns a stop function
 * that cancels without marking anything saved.
 */
export function startCloudAutosave({
  designId,
  onState,
  save = ({ designId: id, baseSeq, mutationKey, document, kind = 'autosave', label }) =>
    saveDesignVersion({
      designId: id,
      request: { baseSeq, mutationKey, kind, ...(label ? { label } : {}), content: document },
    }),
  ...timing
}: {
  designId: string
  onState?: (state: SaveState, controller: SaveController) => void
  save?: SaveControllerOptions['save']
} & Pick<SaveControllerOptions, 'debounceMs' | 'setTimer' | 'clearTimer' | 'newKey'>) {
  const editor = useEditorStore.getState()
  const controller = createSaveController({
    designId,
    headSeq: editor.cloud?.headSeq ?? 1,
    revision: editor.revision,
    save,
    onAcknowledged: ({ headSeq }) => {
      useEditorStore.getState().setCloudHead({ headSeq })
      trackAssumptionOnce({ name: 'design_saved', scope: designId })
    },
    ...timing,
  })

  onState?.(controller.getState(), controller)
  const stopState = controller.subscribe((state) => onState?.(state, controller))
  const stopEditor = useEditorStore.subscribe((state, previous) => {
    // A reload (e.g. after a restore) is not an edit; the hook starts a
    // fresh controller for it.
    if (
      state.revision !== previous.revision &&
      state.cloudLoad === previous.cloudLoad &&
      state.cloud?.designId === designId
    ) {
      controller.notify({ revision: state.revision, document: getCanonicalDocument() })
    }
  })

  return {
    controller,
    stop() {
      controller.cancel()
      stopState()
      stopEditor()
    },
  }
}

export type LocalCopyState =
  | { status: 'none' }
  | { status: 'kept' }
  | { status: 'failed'; reason: StorageFailure }

/**
 * Keeps unacknowledged revisions of one cloud design in owner-scoped local
 * recovery (S05 #174): written on every revision the cloud has not
 * acknowledged, re-based or cleared on each acknowledgement. Every write
 * and clear is under this tab's writer id, so another tab on the same
 * design never loses its own unsaved copy to this one. Writes are
 * serialized and stop once the account or design changes. A failed write
 * is reported, never treated as saved.
 */
export function startCloudRecovery({
  designId,
  ownerId,
  storage,
  controller,
  onLocal,
  writerId = RECOVERY_WRITER_ID,
}: {
  designId: string
  ownerId: string
  writerId?: string
  storage: RecoveryStorage
  controller: SaveController
  onLocal?: (state: LocalCopyState) => void
}) {
  let stopped = false
  let queue: Promise<unknown> = Promise.resolve()
  const sameAccount = accountGuard()

  function live() {
    return !stopped && sameAccount() && useEditorStore.getState().cloud?.designId === designId
  }

  function enqueue(run: () => Promise<RecoveryWriteResult>, kept: boolean) {
    queue = queue.then(async () => {
      if (!live()) {
        return
      }

      const result = await run()

      if (stopped) {
        return
      }

      onLocal?.(
        result.ok
          ? { status: kept ? 'kept' : 'none' }
          : { status: 'failed', reason: result.reason },
      )
    })
    return queue
  }

  function keep() {
    const editor = useEditorStore.getState()

    if (!editor.cloud) {
      return queue
    }

    const revision = editor.revision
    // The controller's head is the base the next save will send; the store
    // hears about an acknowledgement only after the controller does.
    const baseSeq = controller.getState().headSeq
    const document = getCanonicalDocument()

    return enqueue(
      () => writeRecovery({ storage, ownerId, designId, writerId, baseSeq, revision, document }),
      true,
    )
  }

  const stopEditor = useEditorStore.subscribe((state, previous) => {
    if (
      state.revision !== previous.revision &&
      state.cloud?.designId === designId &&
      state.revision > controller.getState().savedRevision
    ) {
      void keep()
    }
  })

  let acknowledged = controller.getState().savedRevision
  const stopController = controller.subscribe((state) => {
    if (state.savedRevision === acknowledged) {
      return
    }

    acknowledged = state.savedRevision

    // Newer edits are still only local: keep them on the new cloud base.
    if (useEditorStore.getState().revision > acknowledged) {
      void keep()
    } else {
      void enqueue(() => clearRecovery({ storage, ownerId, designId, writerId }), false)
    }
  })

  // Work made before this started (a recovered copy) is kept at once.
  if (useEditorStore.getState().revision > acknowledged) {
    void keep()
  }

  return {
    /** Resolves once queued writes have settled (tests). */
    settled: () => queue,
    stop() {
      stopped = true
      stopEditor()
      stopController()
    },
  }
}
