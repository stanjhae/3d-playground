import { describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'

describe('createEmptyDesign', () => {
  test('fills the frozen Design shape', () => {
    const design = createEmptyDesign({ id: 'look-1' })

    expect(design).toEqual({
      id: 'look-1',
      title: '',
      author: '',
      votes: 0,
      thumbnailDataUrl: '',
      overrides: [],
    })
  })
})
