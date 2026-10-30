import { beforeEach, describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { startCloudAutosave } from './cloud-autosave'
import { useEditorStore } from './editor-store'
import type { FlpResult } from './flp-api/client'
import type { VersionResponse } from './flp-api/contract'
import type { SaveRequest, SaveState } from './save-controller'

const store = () => useEditorStore.getState()
const DESIGN = '0f6e8b8c-3c1d-4f7a-9a52-2f1c5b7e9d10'

function harness() {
  const timers: Array<() => void> = []
  const sent: SaveRequest[] = []
  const states: SaveState['status'][] = []
  let nextSeq = 2
  const autosave = startCloudAutosave({
    designId: DESIGN,
    debounceMs: 2000,
    setTimer: (callback) => {
      timers.push(callback)
      return callback
    },
    clearTimer: (handle) => {
      const index = timers.indexOf(handle as () => void)
      if (index >= 0) timers.splice(index, 1)
    },
    save: async (request): Promise<FlpResult<VersionResponse>> => {
      sent.push(request)
      return {
        ok: true,
        data: { designId: DESIGN, seq: nextSeq++, kind: 'autosave', contentHash: 'sha256:x', restoredFromSeq: null, createdAt: '' },
      }
    },
    onState: (state) => states.push(state.status),
  })

  return {
    autosave,
    sent,
    states,
    async elapse() {
      timers.splice(0).forEach((callback) => callback())
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

describe('studio autosave binding', () => {
  beforeEach(() => {
    store().reset()
    store().loadCanonical({
      document: createEmptyCanonicalDocument(),
      cloud: { designId: DESIGN, headSeq: 1, title: 'Tee' },
    })
  })

  test('an edit in the studio is saved as the canonical document after the quiet period', async () => {
    const h = harness()

    store().addText({ content: 'CLOUD', panel: 'front' })
    expect(h.sent).toHaveLength(0)

    await h.elapse()

    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ designId: DESIGN, baseSeq: 1, revision: store().revision })
    expect(h.sent[0]?.document.panels.front.layers[0]).toMatchObject({ kind: 'text', content: 'CLOUD' })
    expect(store().cloud?.headSeq).toBe(2)
    expect(h.states.at(-1)).toBe('saved')
    h.autosave.stop()
  })

  test('tool and view changes are not edits and never trigger a save', async () => {
    const h = harness()

    store().setPaintTool({ paintTool: 'eraser' })
    store().setStudioView({ studioView: 'draw' })
    await h.elapse()

    expect(h.sent).toHaveLength(0)
    h.autosave.stop()
  })

  test('stopping (leaving the studio) saves nothing further', async () => {
    const h = harness()

    store().addText({ content: 'LATE' })
    h.autosave.stop()
    await h.elapse()

    expect(h.sent).toHaveLength(0)
    expect(store().cloud?.headSeq).toBe(1)
  })
})

describe('reloading after a restore (S08 #177)', () => {
  beforeEach(() => {
    store().reset()
    store().loadCanonical({
      document: createEmptyCanonicalDocument(),
      cloud: { designId: DESIGN, headSeq: 1, title: 'Tee' },
    })
  })

  test('loading the restored head is not an edit and is never autosaved', async () => {
    const h = harness()
    const loads = store().cloudLoad
    const revision = store().revision

    store().loadCanonical({
      document: createEmptyCanonicalDocument(),
      cloud: { designId: DESIGN, headSeq: 5, title: 'Tee' },
    })
    await h.elapse()

    expect(store().cloudLoad).toBe(loads + 1)
    expect(store().revision).not.toBe(revision)
    expect(h.sent).toHaveLength(0)
    h.autosave.stop()
  })
})
