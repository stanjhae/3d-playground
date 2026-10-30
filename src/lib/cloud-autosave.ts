import { getCanonicalDocument, useEditorStore } from './editor-store.ts'
import { saveDesignVersion } from './flp-api/client.ts'
import {
  type SaveController,
  type SaveControllerOptions,
  type SaveState,
  createSaveController,
} from './save-controller.ts'

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
