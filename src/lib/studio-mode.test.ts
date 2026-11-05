import { describe, expect, test } from 'vitest'

import { useEditorStore } from './editor-store'
import { PRO_TOOLS_KEY, firstCreateStep, readProTools, writeProTools } from './studio-mode'

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

  test('a tool changes only the panel shown, and a reset puts Draw back', () => {
    const before = useEditorStore.getState()
    useEditorStore.getState().setDesignTool({ designTool: 'text' })
    expect(useEditorStore.getState().designTool).toBe('text')
    expect(useEditorStore.getState().studioView).toBe(before.studioView)
    expect(useEditorStore.getState().revision).toBe(before.revision)
    useEditorStore.getState().reset()
    expect(useEditorStore.getState().designTool).toBe('draw')
  })
})
