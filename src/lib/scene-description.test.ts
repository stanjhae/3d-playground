import { describe, expect, test } from 'vitest'

import type { DesignDocument, DesignLayer } from './design-document'
import { describeDesign } from './scene-description'

function document(layers: unknown[]) {
  return { garmentId: 'tee', garmentVersion: 1, structural: {}, overrides: [], layers: layers as DesignLayer[] } as unknown as DesignDocument
}

const text = (content: string, panel = 'front', visible = true) => ({ kind: 'text', panel, content, visible })
const graphic = (panel: string) => ({ kind: 'graphic', panel, visible: true })
const paint = (panel: string, tool = 'brush') => ({ kind: 'paint', visible: true, strokes: [{ panel, tool }] })

describe('describeDesign', () => {
  test('says when nothing is on it', () => {
    expect(describeDesign({ document: document([]) })).toBe('3D preview of your design. No artwork on it yet.')
  })

  test('names words and counts the rest, side by side', () => {
    expect(
      describeDesign({ document: document([text('KEYS'), graphic('front'), graphic('front'), paint('back')]) }),
    ).toBe('3D preview of your design. Front: “KEYS”, 2 images. Back: 1 drawing.')
  })

  test('names sleeves from the wearer’s side', () => {
    expect(describeDesign({ document: document([graphic('left')]) })).toContain('Right sleeve: 1 image.')
  })

  test('leaves out hidden layers and eraser-only paint', () => {
    expect(describeDesign({ document: document([text('secret', 'front', false), paint('front', 'eraser')]) })).toContain('No artwork')
  })

  test('shortens long words', () => {
    expect(describeDesign({ document: document([text('x'.repeat(60))]) })).toContain(`“${'x'.repeat(40)}…”`)
  })

  test('mentions a pattern', () => {
    expect(describeDesign({ document: document([{ kind: 'pattern', panel: 'front', visible: true }]) })).toContain('Patterned cloth.')
  })
})
