import { describe, expect, test } from 'vitest'

import {
  NUDGE_STEP,
  NUDGE_STEP_LARGE,
  isTypingTarget,
  patternKeyAction,
  patternKeyList,
  historyShortcuts,
  studioKeyAction,
  studioKeyList,
} from './studio-keys'

const button = { tagName: 'BUTTON', isContentEditable: false, closest: () => null }

describe('isTypingTarget (#163)', () => {
  test('inputs, textareas, selects and contenteditable keep their keys', () => {
    expect(isTypingTarget({ target: { tagName: 'INPUT' } })).toBe(true)
    expect(isTypingTarget({ target: { tagName: 'textarea' } })).toBe(true)
    expect(isTypingTarget({ target: { tagName: 'SELECT' } })).toBe(true)
    expect(isTypingTarget({ target: { tagName: 'DIV', isContentEditable: true } })).toBe(true)
  })

  test('buttons, the body and no target are not typing targets', () => {
    expect(isTypingTarget({ target: button })).toBe(false)
    expect(isTypingTarget({ target: { tagName: 'BODY' } })).toBe(false)
    expect(isTypingTarget({ target: null })).toBe(false)
  })
})

describe('studioKeyAction (#163)', () => {
  test('arrows nudge the selection; Shift nudges further', () => {
    expect(studioKeyAction({ key: 'ArrowRight', target: button, hasSelection: true })).toEqual({
      type: 'nudge',
      dx: NUDGE_STEP,
      dy: 0,
    })
    // Panel y runs bottom-up, as layer-hit draws it.
    expect(studioKeyAction({ key: 'ArrowUp', shiftKey: true, hasSelection: true })).toEqual({
      type: 'nudge',
      dx: 0,
      dy: NUDGE_STEP_LARGE,
    })
    expect(studioKeyAction({ key: 'ArrowDown', hasSelection: true })).toEqual({
      type: 'nudge',
      dx: 0,
      dy: -NUDGE_STEP,
    })
  })

  test('Delete and Backspace remove, Escape deselects', () => {
    expect(studioKeyAction({ key: 'Delete', hasSelection: true })).toEqual({ type: 'delete' })
    expect(studioKeyAction({ key: 'Backspace', hasSelection: true })).toEqual({ type: 'delete' })
    expect(studioKeyAction({ key: 'Escape', hasSelection: true })).toEqual({ type: 'deselect' })
  })

  test('object keys do nothing without a selection', () => {
    for (const key of ['ArrowLeft', 'Delete', 'Backspace', 'Escape']) {
      expect(studioKeyAction({ key, hasSelection: false })).toBeNull()
    }
  })

  test('Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes, selection or not', () => {
    expect(studioKeyAction({ key: 'z', metaKey: true, hasSelection: false })).toEqual({ type: 'undo' })
    expect(studioKeyAction({ key: 'z', ctrlKey: true, hasSelection: true })).toEqual({ type: 'undo' })
    expect(studioKeyAction({ key: 'Z', metaKey: true, shiftKey: true, hasSelection: false })).toEqual({
      type: 'redo',
    })
    expect(studioKeyAction({ key: 'y', ctrlKey: true, hasSelection: false })).toEqual({ type: 'redo' })
  })

  test('nothing fires while focus is in an input, textarea or contenteditable', () => {
    const targets = [
      { tagName: 'INPUT' },
      { tagName: 'TEXTAREA' },
      { tagName: 'DIV', isContentEditable: true },
    ]

    for (const target of targets) {
      expect(studioKeyAction({ key: 'z', metaKey: true, target, hasSelection: true })).toBeNull()
      expect(studioKeyAction({ key: 'z', metaKey: true, shiftKey: true, target, hasSelection: true })).toBeNull()
      expect(studioKeyAction({ key: 'ArrowLeft', target, hasSelection: true })).toBeNull()
      expect(studioKeyAction({ key: 'Backspace', target, hasSelection: true })).toBeNull()
      expect(studioKeyAction({ key: '?', shiftKey: true, target, hasSelection: true })).toBeNull()
    }
  })

  test('Esc deselects even from the type field, so a word placed with Enter can be let go', () => {
    const input = { tagName: 'INPUT', closest: () => null }
    expect(studioKeyAction({ key: 'Escape', target: input, hasSelection: true })).toEqual({ type: 'deselect' })
    // Paint (not placeable) still lets go on Esc.
    expect(studioKeyAction({ key: 'Escape', hasSelection: false, canDeselect: true })).toEqual({ type: 'deselect' })
    expect(studioKeyAction({ key: 'Escape', target: input, hasSelection: false })).toBeNull()
    expect(studioKeyAction({ key: 'Escape', target: input, hasSelection: true, inDesign: false })).toBeNull()
    expect(studioKeyAction({ key: 'Escape', shiftKey: true, hasSelection: true })).toBeNull()
  })

  test('Esc inside a dialog is the dialog’s', () => {
    const inDialog = { tagName: 'BUTTON', closest: (selector: string) => (selector.includes('dialog') ? {} : null) }
    expect(studioKeyAction({ key: 'Escape', target: inDialog, hasSelection: true })).toBeNull()
  })

  test('? toggles the shortcuts, but not from a text field or with a modifier', () => {
    expect(studioKeyAction({ key: '?', shiftKey: true, hasSelection: false })).toEqual({ type: 'help' })
    expect(studioKeyAction({ key: '?', shiftKey: true, hasSelection: true, inDesign: false })).toEqual({ type: 'help' })
    expect(studioKeyAction({ key: '?', shiftKey: true, metaKey: true, hasSelection: false })).toBeNull()
    expect(studioKeyAction({ key: '?', shiftKey: true, target: { tagName: 'TEXTAREA' }, hasSelection: false })).toBeNull()
  })

  test('arrows inside a radio group or tab list stay with that widget', () => {
    const radio = { tagName: 'BUTTON', closest: (selector: string) => (selector.includes('radiogroup') ? {} : null) }
    expect(studioKeyAction({ key: 'ArrowRight', target: radio, hasSelection: true })).toBeNull()
    expect(studioKeyAction({ key: 'Delete', target: radio, hasSelection: true })).toEqual({ type: 'delete' })
  })

  test('other modifier combinations and plain keys are left alone', () => {
    expect(studioKeyAction({ key: 'k', metaKey: true, hasSelection: true })).toBeNull()
    expect(studioKeyAction({ key: 'z', metaKey: true, altKey: true, hasSelection: true })).toBeNull()
    expect(studioKeyAction({ key: 'ArrowLeft', altKey: true, hasSelection: true })).toBeNull()
    expect(studioKeyAction({ key: 'a', hasSelection: true })).toBeNull()
  })
})

describe('studioKeyAction, A3 keys', () => {
  test('Cmd/Ctrl+D duplicates and Cmd/Ctrl+C copies the selection', () => {
    expect(studioKeyAction({ key: 'd', metaKey: true, hasSelection: true })).toEqual({ type: 'duplicate' })
    expect(studioKeyAction({ key: 'D', ctrlKey: true, hasSelection: true })).toEqual({ type: 'duplicate' })
    expect(studioKeyAction({ key: 'c', metaKey: true, hasSelection: true })).toEqual({ type: 'copy' })
  })

  test('without a selection, D and C keep their browser meaning', () => {
    expect(studioKeyAction({ key: 'd', metaKey: true, hasSelection: false })).toBeNull()
    expect(studioKeyAction({ key: 'c', metaKey: true, hasSelection: false })).toBeNull()
  })

  test('Cmd/Ctrl+C copies selected page text, not the design', () => {
    const withText = { tagName: 'BODY', ownerDocument: { defaultView: { getSelection: () => ({ toString: () => 'hello' }) } } }
    expect(studioKeyAction({ key: 'c', metaKey: true, target: withText, hasSelection: true })).toBeNull()
  })

  test('Cmd/Ctrl+V pastes only once something was copied, on the design step', () => {
    expect(studioKeyAction({ key: 'v', metaKey: true, hasSelection: false, canPaste: true })).toEqual({ type: 'paste' })
    expect(studioKeyAction({ key: 'v', metaKey: true, hasSelection: false, canPaste: false })).toBeNull()
    expect(studioKeyAction({ key: 'v', metaKey: true, hasSelection: false, canPaste: true, inDesign: false })).toBeNull()
  })

  test('B, E, T and G pick a tool, selection or not, but not mid-stroke or off the design step', () => {
    expect(studioKeyAction({ key: 'b', hasSelection: false })).toEqual({ type: 'tool', tool: 'brush' })
    expect(studioKeyAction({ key: 'e', hasSelection: true })).toEqual({ type: 'tool', tool: 'eraser' })
    expect(studioKeyAction({ key: 't', hasSelection: false })).toEqual({ type: 'tool', tool: 'text' })
    expect(studioKeyAction({ key: 'g', hasSelection: false })).toEqual({ type: 'tool', tool: 'graphics' })
    expect(studioKeyAction({ key: 'b', hasSelection: false, drawing: true })).toBeNull()
    expect(studioKeyAction({ key: 'b', hasSelection: false, inDesign: false })).toBeNull()
    expect(studioKeyAction({ key: 'B', shiftKey: true, hasSelection: false })).toBeNull()
    expect(studioKeyAction({ key: 'b', target: { tagName: 'INPUT' }, hasSelection: false })).toBeNull()
  })

  test('Esc cancels a stroke mid-draw before it deselects, even from an input', () => {
    expect(studioKeyAction({ key: 'Escape', hasSelection: true, drawing: true })).toEqual({ type: 'cancelStroke' })
    expect(studioKeyAction({ key: 'Escape', target: { tagName: 'INPUT' }, hasSelection: false, drawing: true })).toEqual({
      type: 'cancelStroke',
    })
    expect(studioKeyAction({ key: 'Escape', hasSelection: true, drawing: false })).toEqual({ type: 'deselect' })
  })
})

describe('studioKeyList', () => {
  test('names every key the studio handles', () => {
    const keys = studioKeyList({ mod: 'Ctrl' }).map((entry) => entry.keys)
    expect(keys).toEqual(
      expect.arrayContaining(['Arrow keys', 'Shift + arrow keys', 'Delete or Backspace', 'Esc', 'Ctrl + D', 'Ctrl + C, then Ctrl + V', 'B, E, T, G', 'Ctrl + Z', 'Shift + Ctrl + Z', '?']),
    )
  })

  test('undo and redo name their keys for the platform', () => {
    expect(historyShortcuts({ apple: true })).toEqual({ undo: '⌘Z', redo: '⇧⌘Z', undoAria: 'Meta+Z', redoAria: 'Shift+Meta+Z' })
    expect(historyShortcuts({ apple: false }).undo).toBe('Ctrl+Z')
    expect(historyShortcuts({ apple: false }).redoAria).toContain('Control+Shift+Z')
  })
})

describe('patternKeyAction', () => {
  test('arrows move a focused point by millimetres, y up', () => {
    expect(patternKeyAction({ key: 'ArrowUp', on: 'point' })).toEqual({ type: 'nudge', dx: 0, dy: 1 })
    expect(patternKeyAction({ key: 'ArrowLeft', shiftKey: true, on: 'point' })).toEqual({ type: 'nudge', dx: -10, dy: 0 })
    expect(patternKeyAction({ key: 'ArrowUp', on: 'edge' })).toBeNull()
  })

  test('Delete removes a point; + or Insert adds one on an edge; S slits an edge', () => {
    expect(patternKeyAction({ key: 'Delete', on: 'point' })).toEqual({ type: 'removePoint' })
    expect(patternKeyAction({ key: 'Backspace', on: 'point' })).toEqual({ type: 'removePoint' })
    expect(patternKeyAction({ key: 'Delete', on: 'edge' })).toBeNull()
    expect(patternKeyAction({ key: '+', on: 'edge' })).toEqual({ type: 'addPoint' })
    expect(patternKeyAction({ key: 'Insert', on: 'edge' })).toEqual({ type: 'addPoint' })
    expect(patternKeyAction({ key: 's', on: 'edge' })).toEqual({ type: 'slit' })
    expect(patternKeyAction({ key: 's', on: 'point' })).toBeNull()
    expect(patternKeyAction({ key: 'Escape', on: 'edge' })).toEqual({ type: 'deselect' })
  })

  test('C goes to the cut-out tools; on a cut-out, arrows move it and Delete removes it', () => {
    expect(patternKeyAction({ key: 'c', on: 'point' })).toEqual({ type: 'cutout' })
    expect(patternKeyAction({ key: 'C', on: 'edge' })).toEqual({ type: 'cutout' })
    expect(patternKeyAction({ key: 'ArrowDown', shiftKey: true, on: 'hole' })).toEqual({ type: 'nudge', dx: 0, dy: -10 })
    expect(patternKeyAction({ key: 'Delete', on: 'hole' })).toEqual({ type: 'removeCutout' })
    expect(patternKeyAction({ key: 'Backspace', on: 'hole' })).toEqual({ type: 'removeCutout' })
    expect(patternKeyAction({ key: 'Escape', on: 'hole' })).toEqual({ type: 'deselect' })
    expect(patternKeyAction({ key: '+', on: 'hole' })).toBeNull()
  })

  test('shortcuts with a modifier pass through to undo and the browser', () => {
    expect(patternKeyAction({ key: 'z', metaKey: true, on: 'point' })).toBeNull()
    expect(patternKeyAction({ key: 'Delete', ctrlKey: true, on: 'point' })).toBeNull()
  })

  test('the help names every key it handles', () => {
    expect(patternKeyList().map((entry) => entry.keys)).toEqual([
      'Tab',
      'Arrow keys',
      'Delete or Backspace',
      '+ or Insert',
      'S',
      'C',
      'Arrow keys on a cut-out',
      'Delete on a cut-out',
      'Esc',
    ])
  })
})
