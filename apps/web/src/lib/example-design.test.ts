import { expect, test } from 'vitest'

import { validateCanonicalDocument } from './canonical-document'
import { createExampleDocument } from './example-design'

test('the example is a valid design on the current template, with no images to clear', () => {
  const document = createExampleDocument()

  expect(validateCanonicalDocument({ value: JSON.parse(JSON.stringify(document)) }).ok).toBe(true)
  expect(Object.values(document.panels).flatMap((panel) => panel.layers).some((layer) => layer.kind === 'image')).toBe(false)
})

test('each copy is its own, so changing one changes no other', () => {
  const one = createExampleDocument()
  const two = createExampleDocument()

  one.panels.front.layers.length = 0
  expect(two.panels.front.layers).toHaveLength(1)
})
