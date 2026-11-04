import { type CanonicalDocument, createEmptyCanonicalDocument } from './canonical-document.ts'

export const EXAMPLE_DESIGN_TITLE = 'Example design'

/**
 * A worked example, made fresh for each copy (E13 #214), so nothing shared
 * can change. Paint and text only, which need no cleared artwork (#138).
 */
export function createExampleDocument(): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  const ink = '#6b1d2a' as const

  document.panels.front.layers = [
    {
      id: 'paint-example-front',
      kind: 'paint',
      visible: true,
      opacity: 1,
      strokes: [
        { id: 'stroke-example-1', tool: 'brush', color: ink, width: 0.03, opacity: 1, points: [0.28, 0.62, 0.5, 0.48, 0.72, 0.62] },
        { id: 'stroke-example-2', tool: 'brush', color: ink, width: 0.03, opacity: 1, points: [0.28, 0.48, 0.5, 0.34, 0.72, 0.48] },
      ],
    },
  ]
  document.panels.back.layers = [
    {
      id: 'word-example-back',
      kind: 'text',
      visible: true,
      opacity: 1,
      x: 0.5,
      y: 0.55,
      scale: 0.09,
      rotation: 0,
      content: 'FIRST',
      face: 'display',
      color: ink,
    },
  ]
  document.panels.right.layers = [
    {
      id: 'paint-example-sleeve',
      kind: 'paint',
      visible: true,
      opacity: 1,
      strokes: [{ id: 'stroke-example-3', tool: 'brush', color: ink, width: 0.02, opacity: 1, points: [0.2, 0.5, 0.8, 0.5] }],
    },
  ]

  return document
}
