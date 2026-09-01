import { describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'
import { lookRecipe, lookShareLine } from './look-recipe'

describe('lookRecipe', () => {
  test('names only cloth that lives on the form', () => {
    const design = {
      ...createEmptyDesign({ id: 'look-midnight-silk' }),
      garmentId: 'column' as const,
      overrides: [
        {
          meshName: 'body',
          color: '#1a1c22',
          mapId: 'cotton-weave',
        },
        {
          meshName: 'collar',
          color: '#c4a15a',
          mapId: 'silk-shine',
        },
        {
          meshName: 'lining',
          color: '#e8c4b8',
          mapId: 'silk-shine',
        },
        {
          meshName: 'hardware',
          color: '#6b1d2a',
          mapId: 'leather-grain',
        },
      ],
    }

    expect(lookRecipe({ design })).toBe('Gown · Ink Cotton')
  })

  test('reads cotton and leather on shirt and skirt', () => {
    const design = {
      ...createEmptyDesign({ id: 'look-mixed' }),
      garmentId: 'mixed' as const,
      overrides: [
        {
          meshName: 'body',
          color: '#f3efe6',
          mapId: 'cotton-weave',
        },
        {
          meshName: 'skirt',
          color: '#4a2f22',
          mapId: 'leather-grain',
        },
      ],
    }

    expect(lookRecipe({ design })).toBe('Shirt & skirt · Cotton and Leather')
  })

  test('keeps jacket lining and collar in the line', () => {
    const design = {
      ...createEmptyDesign({ id: 'look-jacket' }),
      garmentId: 'jacket' as const,
      overrides: [
        {
          meshName: 'body',
          color: '#f4ead4',
          mapId: 'silk-shine',
        },
        {
          meshName: 'lining',
          color: '#e8c4b8',
          mapId: 'silk-shine',
        },
        {
          meshName: 'collar',
          color: '#f6e7d8',
          mapId: 'silk-shine',
        },
      ],
    }

    expect(lookRecipe({ design })).toBe('Jacket · Ivory Silk, Blush Silk and Silk')
  })

  test('keeps the last cloth on a part', () => {
    const design = {
      ...createEmptyDesign({ id: 'look-last-cloth' }),
      garmentId: 'gown' as const,
      overrides: [
        {
          meshName: 'body',
          color: '#f3efe6',
          mapId: 'cotton-weave',
        },
        {
          meshName: 'body',
          color: '#f6e7d8',
          mapId: 'silk-shine',
        },
      ],
    }

    expect(lookRecipe({ design })).toBe('Gown · Silk')
  })

  test('is the form alone when no cloth is applied', () => {
    expect(
      lookRecipe({
        design: createEmptyDesign({ id: 'look-plain' }),
      }),
    ).toBe('Gown')
  })
})

describe('lookShareLine', () => {
  test('puts the recipe before the author', () => {
    expect(
      lookShareLine({
        recipe: 'Gown · Ink Cotton',
        author: 'Elise Moreau',
      }),
    ).toBe('Gown · Ink Cotton. By Elise Moreau')
  })
})
