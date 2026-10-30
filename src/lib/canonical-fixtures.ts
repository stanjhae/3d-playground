import type { CanonicalDocument } from './canonical-document.ts'

/**
 * Golden example contract. Its hash is pinned in canonical-hash.test.ts
 * and quoted in docs/canonical-document.md; change all three together.
 */
export const GOLDEN_DOCUMENT: CanonicalDocument = {
  schemaVersion: 2,
  template: { id: 'tee-crew-short', version: 1 },
  base: {
    kind: 'stripes',
    colors: ['#111318', '#f4ead4'],
    period: 0.08,
    angle: 0.785398,
  },
  panels: {
    front: {
      layers: [
        {
          id: 'paint-front',
          kind: 'paint',
          visible: true,
          opacity: 1,
          strokes: [
            {
              id: 'stroke-1',
              tool: 'brush',
              color: '#1a1c22',
              width: 0.024,
              opacity: 0.8,
              points: [0.2, 0.8, 0.25, 0.7, 0.4, 0.65],
            },
            {
              id: 'stroke-2',
              tool: 'eraser',
              width: 0.04,
              points: [0.24, 0.72, 0.26, 0.69],
            },
          ],
        },
        {
          id: 'image-front',
          kind: 'image',
          visible: true,
          opacity: 0.9,
          name: 'Crest',
          assetId: 'asset_3f9a1c22b7',
          aspect: 1.5,
          x: 0.5,
          y: 0.6,
          scale: 0.32,
          rotation: -0.218166,
        },
      ],
    },
    back: {
      layers: [
        {
          id: 'text-back',
          kind: 'text',
          visible: true,
          opacity: 1,
          content: 'Café 26',
          face: 'display',
          color: '#c4a15a',
          x: 0.5,
          y: 0.8,
          scale: 0.2,
          rotation: 0,
        },
      ],
    },
    left: { layers: [] },
    right: { layers: [] },
  },
}
