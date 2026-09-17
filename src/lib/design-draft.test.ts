import { describe, expect, test } from 'vitest'

import { createEmptyDocument } from './design-document'
import { parseDraft, serializeDraft } from './design-draft'

describe('design draft', () => {
  test('round-trips a tee document', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const raw = serializeDraft({ garmentId: 'tee', document })
    const draft = parseDraft({ value: raw })

    expect(draft?.garmentId).toBe('tee')
    expect(draft?.document.layers[0]?.kind).toBe('paint')
  })

  test('rejects junk', () => {
    expect(parseDraft({ value: 'nope' })).toBeNull()
  })
})
