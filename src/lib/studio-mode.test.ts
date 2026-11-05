import { describe, expect, test } from 'vitest'

import { useEditorStore } from './editor-store'
import { PRO_TOOLS_KEY, firstCreateStep, readProTools, useStudioMode, writeProTools } from './studio-mode'

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('studio mode', () => {
  test('is Guided until switched to Pro, and remembers it', () => {
    const storage = memory()
    expect(readProTools({ storage })).toBe(false)
    writeProTools({ on: true, storage })
    expect(storage.getItem(PRO_TOOLS_KEY)).toBe('on')
    expect(readProTools({ storage })).toBe(true)
  })

  test('a blocked store reads as Guided', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readProTools({ storage })).toBe(false)
    expect(() => writeProTools({ on: true, storage })).not.toThrow()
  })

  test('Guided opens on the garment, Pro on the design', () => {
    expect(firstCreateStep({ pro: false })).toBe('select')
    expect(firstCreateStep({ pro: true })).toBe('design')
  })

  test('a tool sets the view it needs and leaves the design alone', () => {
    const before = useEditorStore.getState().revision
    useStudioMode.getState().setDesignTool({ designTool: 'graphics' })
    expect(useEditorStore.getState().designEditMode).toBe('tech')
    useStudioMode.getState().setDesignTool({ designTool: 'draw' })
    expect(useEditorStore.getState().designEditMode).toBe('draw')
    expect(useEditorStore.getState().revision).toBe(before)
  })
})
