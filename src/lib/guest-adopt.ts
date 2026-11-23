import type { CanonicalDocument } from './canonical-document'
import { createEmptyCanonicalDocument } from './canonical-document'
import { clearDraft, loadDraft } from './design-draft'
import type { CreateStepId } from './create-steps'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import { createOwnedDesign } from './flp-api/client'
import { documentGarment, untitledTitle } from './my-studio-list'

const ADOPT_KEY = 'flv:guest-adopt-key'

let adoptFailure: string | null = null

/** Shown once if signing in could not save the guest sketch. */
export function takeGuestAdoptFailure() {
  const message = adoptFailure
  adoptFailure = null
  return message
}

function sameJson({ left, right }: { left: unknown; right: unknown }) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** True when the document is not the blank garment its template starts as. */
export function canonicalSketchHasWork({ document }: { document: CanonicalDocument }) {
  const empty = createEmptyCanonicalDocument({ templateId: document.template.id })

  return (
    !sameJson({ left: document.base, right: empty.base }) ||
    !sameJson({ left: document.panels, right: empty.panels }) ||
    !sameJson({ left: document.shape ?? null, right: empty.shape ?? null })
  )
}

/**
 * Which sketch to save: the one still open, else the copy on this device.
 * An open cloud design is already the account's, not a guest sketch: after
 * editing one, Create must offer a new design, not save a copy of it.
 */
export function guestSketchSource({
  memoryIsCloud,
  memoryHasWork,
  draftHasWork,
}: {
  memoryIsCloud: boolean
  memoryHasWork: boolean
  draftHasWork: boolean
}): 'memory' | 'draft' | 'none' {
  if (memoryHasWork && !memoryIsCloud) {
    return 'memory'
  }

  return draftHasWork ? 'draft' : 'none'
}

function adoptKey({ storage }: { storage: Pick<Storage, 'getItem' | 'setItem'> | null }) {
  const existing = storage?.getItem(ADOPT_KEY)

  if (existing) {
    return existing
  }

  const key = crypto.randomUUID()
  storage?.setItem(ADOPT_KEY, key)
  return key
}

export type GuestAdoptResult =
  | { action: 'studio' }
  | { action: 'cloud'; designId: string; step: CreateStepId }
  | { action: 'stay'; message: string }

/**
 * A signed-in return to /create with no cloud design. The open sketch, or
 * the guest draft, becomes an owned design. A blank visit starts a new one
 * in My Studio. A failed save stays here so the sketch is not discarded.
 */
export async function adoptGuestSketch({
  step = 'design',
  storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
}: {
  step?: CreateStepId
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
} = {}): Promise<GuestAdoptResult> {
  const memory = getCanonicalDocument()
  const source = guestSketchSource({
    memoryIsCloud: useEditorStore.getState().cloud !== null,
    memoryHasWork: canonicalSketchHasWork({ document: memory }),
    draftHasWork: false,
  })
  let document = source === 'memory' ? memory : null

  if (!document) {
    const draft = await loadDraft()

    if (draft) {
      useEditorStore.getState().hydrateDocument({ document: draft.document, garmentId: draft.garmentId })
      const restored = getCanonicalDocument()

      if (canonicalSketchHasWork({ document: restored })) {
        document = restored
      }
    }
  }

  if (!document) {
    return { action: 'studio' }
  }

  const created = await createOwnedDesign({
    request: {
      mutationKey: adoptKey({ storage }),
      title: untitledTitle({ garmentId: documentGarment({ document }) }),
      content: document,
    },
  })

  if (!created.ok) {
    const message = `Your sketch is still on this device. It could not be saved to your account. ${created.message}`
    adoptFailure = message
    return { action: 'stay', message }
  }

  storage?.removeItem(ADOPT_KEY)
  await clearDraft()
  return { action: 'cloud', designId: created.data.designId, step }
}
