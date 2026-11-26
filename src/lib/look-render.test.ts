import { describe, expect, it } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { type DesignDocument, sanitizePublishedDocument } from './design-document'
import type { Design } from './design-schema'
import { garmentCreditLine } from './garments'
import { lookRenderDocument, toRenderDocument } from './render-projection'
import { resolveTemplate, templateForGarment } from './template-manifest'

const STROKE = {
  id: 'ink',
  kind: 'paint',
  panel: 'front',
  visible: true,
  strokes: [{ id: 's', tool: 'brush', color: '#111111', width: 6, points: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }] }],
} as const

const TEXT = {
  id: 'word',
  kind: 'text',
  panel: 'front',
  content: 'MAISON',
  face: 'display',
  color: '#111111',
  x: 0.5,
  y: 0.5,
  scale: 0.3,
  rotation: 0,
  opacity: 1,
  visible: true,
} as const

/** What Enter the Vote stores: the studio's render document, sanitised (PublishBar). */
function publishedLook({ templateId, version }: { templateId?: string; version?: number } = {}): Design {
  const { document: rendered } = toRenderDocument({ document: createEmptyCanonicalDocument({ templateId, version }) })
  const withInk: DesignDocument = { ...rendered, layers: [...rendered.layers, STROKE, TEXT] as DesignDocument['layers'] }
  const stored = sanitizePublishedDocument({ document: withInk })!

  return {
    id: 'look-1',
    title: 'Cotton 01',
    author: 'Guest',
    votes: 0,
    thumbnailDataUrl: '',
    overrides: stored.overrides,
    garmentId: stored.garmentId,
    artMap: 'data:image/png;base64,AAAA',
    document: stored,
  }
}

describe('lookRenderDocument', () => {
  it('draws a published tee on the real model it was made on, with its live layers', () => {
    const look = publishedLook()
    // The stored document has lost the model: this is why the look page drew the house form.
    expect(look.document?.modelSrc).toBeUndefined()

    const document = lookRenderDocument({ design: look })
    const manifest = templateForGarment({ garmentId: 'tee' })!

    expect(document.modelSrc).toBe(manifest.geometry.file)
    expect(document.modelSrc).toMatch(/tee-real/)
    expect(document.panelUv?.front).toEqual(manifest.regions.front.uv)
    expect(document.atlasSize).toBe(manifest.atlas.width)
    expect(document.modelFrame).toBeDefined()
    // The stroke and the text are drawn live, not swapped for the baked artMap.
    expect(document.layers.some((layer) => layer.kind === 'art')).toBe(false)
    expect(document.layers.find((layer) => layer.kind === 'text')).toMatchObject({ content: 'MAISON' })
    expect(document.layers.find((layer) => layer.id === 'ink')).toMatchObject({ kind: 'paint' })
  })

  it('keeps each look on its pinned tee version', () => {
    const v4 = resolveTemplate({ id: 'tee-crew-short', version: 4 })
    expect(v4.ok).toBe(true)

    const document = lookRenderDocument({ design: publishedLook({ version: 4 }) })

    expect(document.garmentVersion).toBe(4)
    expect(document.modelSrc).toBe(v4.ok ? v4.manifest.geometry.file : '')
  })

  it('leaves procedural tee looks on the house form', () => {
    const document = lookRenderDocument({ design: publishedLook({ version: 3 }) })

    expect(document.garmentVersion).toBe(2)
    expect(document.modelSrc).toBeUndefined()
    expect(document.panelUv).toBeUndefined()
  })

  it('draws a template-built garment on its own model', () => {
    const document = lookRenderDocument({ design: publishedLook({ templateId: 'slip' }) })

    expect(document.garmentId).toBe('slip')
    expect(document.modelSrc).toBe(templateForGarment({ garmentId: 'slip' })!.geometry.file)
  })

  it('keeps a look with no stored document on its baked artMap', () => {
    const document = lookRenderDocument({
      design: {
        garmentId: 'gown',
        overrides: [{ meshName: 'body', color: '#223344' }],
        artMap: 'data:image/png;base64,AAAA',
      },
    })

    expect(document.modelSrc).toBeUndefined()
    expect(document.layers[0]).toMatchObject({ kind: 'art' })
  })
})

describe('garmentCreditLine', () => {
  it('names each model by its own maker', () => {
    expect(garmentCreditLine({ garmentId: 'tee' })).toBe('ajith98adithya · CC BY 4.0')
    expect(garmentCreditLine({ garmentId: 'slip' })).toBe('Style3D CG · CC BY 4.0')
    expect(garmentCreditLine({ garmentId: 'gown' })).toBe('Style3D CG · CC BY 4.0')
  })

  it('has no line for our own models', () => {
    expect(garmentCreditLine({ garmentId: 'vest' })).toBeNull()
  })
})
