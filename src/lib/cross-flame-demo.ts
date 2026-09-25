import {
  createEmptyDocument,
  createObjectId,
  type DesignDocument,
} from './design-document'

/** Seed document for the landing hero — Cross Flame oversized tee. */
export function createCrossFlameDemoDocument(): DesignDocument {
  const document = createEmptyDocument({ garmentId: 'tee' })

  document.layers.push(
    {
      id: createObjectId({ prefix: 'graphic' }),
      kind: 'graphic',
      panel: 'front',
      src: '/graphics/cross-gothic.svg',
      x: 0.5,
      y: 0.38,
      scale: 0.42,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      id: createObjectId({ prefix: 'graphic' }),
      kind: 'graphic',
      panel: 'front',
      src: '/graphics/flame-rise.svg',
      x: 0.28,
      y: 0.78,
      scale: 0.35,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      id: createObjectId({ prefix: 'graphic' }),
      kind: 'graphic',
      panel: 'front',
      src: '/graphics/flame-side.svg',
      x: 0.72,
      y: 0.78,
      scale: 0.32,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      id: createObjectId({ prefix: 'graphic' }),
      kind: 'graphic',
      panel: 'back',
      src: '/graphics/logo-crown.svg',
      x: 0.5,
      y: 0.32,
      scale: 0.28,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      id: createObjectId({ prefix: 'text' }),
      kind: 'text',
      panel: 'front',
      content: 'FLV',
      face: 'sans',
      color: '#111111',
      x: 0.5,
      y: 0.58,
      scale: 0.1,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
  )

  return document
}
