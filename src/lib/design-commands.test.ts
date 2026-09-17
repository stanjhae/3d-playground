import { describe, expect, test } from 'vitest'

import {
  applyCommand,
  createCommandStack,
  redoCommand,
  undoCommand,
} from './design-commands'
import { createEmptyDocument, createObjectId } from './design-document'

describe('design commands', () => {
  test('draw, undo, redo returns the same stroke', () => {
    const stroke = {
      id: createObjectId({ prefix: 'ink' }),
      panel: 'front' as const,
      points: [{ x: 0.4, y: 0.4 }],
      color: '#1a1c22',
      width: 0.03,
      tool: 'brush' as const,
    }
    let stack = createCommandStack({
      document: createEmptyDocument({ garmentId: 'tee' }),
    })

    stack = applyCommand({
      stack,
      command: { type: 'addStroke', stroke },
    })

    const paint = stack.document.layers[0]
    expect(paint && paint.kind === 'paint' ? paint.strokes : []).toHaveLength(1)

    stack = undoCommand({ stack })
    const undone = stack.document.layers[0]
    expect(undone && undone.kind === 'paint' ? undone.strokes : []).toHaveLength(
      0,
    )

    stack = redoCommand({ stack })
    const redone = stack.document.layers[0]
    expect(
      redone && redone.kind === 'paint' ? redone.strokes[0]?.id : null,
    ).toBe(stroke.id)
  })

  test('clear paint is one undo', () => {
    const stroke = {
      id: createObjectId({ prefix: 'ink' }),
      panel: 'front' as const,
      points: [{ x: 0.4, y: 0.4 }],
      color: '#1a1c22',
      width: 0.03,
      tool: 'brush' as const,
    }
    let stack = createCommandStack({
      document: createEmptyDocument({ garmentId: 'tee' }),
    })
    stack = applyCommand({ stack, command: { type: 'addStroke', stroke } })
    stack = applyCommand({
      stack,
      command: {
        type: 'addStroke',
        stroke: { ...stroke, id: createObjectId({ prefix: 'ink' }) },
      },
    })
    stack = applyCommand({ stack, command: { type: 'clearPaint' } })

    const paint = stack.document.layers[0]
    expect(paint && paint.kind === 'paint' ? paint.strokes : []).toHaveLength(0)

    stack = undoCommand({ stack })
    const restored = stack.document.layers[0]
    expect(
      restored && restored.kind === 'paint' ? restored.strokes : [],
    ).toHaveLength(2)
  })

  test('ignores undo when the stack is empty', () => {
    const stack = createCommandStack({
      document: createEmptyDocument({ garmentId: 'gown' }),
    })

    expect(undoCommand({ stack })).toBe(stack)
    expect(redoCommand({ stack })).toBe(stack)
  })

  test('cloth apply is a command', () => {
    let stack = createCommandStack({
      document: createEmptyDocument({ garmentId: 'tee' }),
    })
    stack = applyCommand({
      stack,
      command: {
        type: 'applyFabric',
        override: {
          meshName: 'body',
          color: '#f6e7d8',
          mapId: 'silk-shine',
        },
      },
    })

    expect(stack.document.overrides).toHaveLength(1)
    stack = undoCommand({ stack })
    expect(stack.document.overrides).toHaveLength(0)
  })
})
