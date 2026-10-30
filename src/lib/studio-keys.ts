/**
 * Studio keyboard alternatives (FLP E12 #163, toward #191). The window
 * listener in DualStudio asks `studioKeyAction` what a key means; this file
 * stays free of the DOM beyond duck-typed targets so it can be unit tested.
 */

/** A nudge moves the selected object this share of its panel. */
export const NUDGE_STEP = 0.01
export const NUDGE_STEP_LARGE = 0.05

/** Nudges of one object closer together than this are one undo step. */
export const NUDGE_MERGE_MS = 800

export type StudioKeyAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'delete' }
  | { type: 'deselect' }

type KeyTarget = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
} | null

/** Widgets whose own arrow keys must not also nudge the object. */
const ARROW_OWNERS =
  '[role="radiogroup"],[role="tablist"],[role="listbox"],[role="menu"],[role="menubar"],[role="slider"],[role="tree"],[role="grid"]'

/** Inputs, textareas, selects and contenteditable keep their own keys. */
export function isTypingTarget({ target }: { target: unknown }) {
  if (!target || typeof target !== 'object') {
    return false
  }

  const node = target as NonNullable<KeyTarget>
  const tag = node.tagName?.toUpperCase()
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    node.isContentEditable === true
  )
}

function ownsArrows({ target }: { target: unknown }) {
  if (!target || typeof target !== 'object') {
    return false
  }

  const node = target as NonNullable<KeyTarget>
  return typeof node.closest === 'function' && Boolean(node.closest(ARROW_OWNERS))
}

// Panel space runs bottom-up (y 0 is the hem side), so Up adds to y.
const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: 1 },
  ArrowDown: { dx: 0, dy: -1 },
}

export function studioKeyAction({
  key,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
  altKey = false,
  target = null,
  hasSelection,
}: {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: unknown
  /** A placeable object (mark, word) is selected in the design step. */
  hasSelection: boolean
}): StudioKeyAction | null {
  if (isTypingTarget({ target })) {
    return null
  }

  if (metaKey || ctrlKey) {
    if (altKey) {
      return null
    }

    const lower = key.toLowerCase()

    if (lower === 'z') {
      return shiftKey ? { type: 'redo' } : { type: 'undo' }
    }

    if (lower === 'y' && !shiftKey) {
      return { type: 'redo' }
    }

    return null
  }

  if (!hasSelection || altKey) {
    return null
  }

  const arrow = ARROWS[key]

  if (arrow) {
    if (ownsArrows({ target })) {
      return null
    }

    const step = shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
    // `+ 0` keeps a stray -0 out of the patch.
    return { type: 'nudge', dx: arrow.dx * step + 0, dy: arrow.dy * step + 0 }
  }

  if (shiftKey) {
    return null
  }

  if (key === 'Delete' || key === 'Backspace') {
    return { type: 'delete' }
  }

  if (key === 'Escape') {
    return { type: 'deselect' }
  }

  return null
}

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** The studio's keys, as the Keyboard help lists them. */
export function studioKeyList({ mod = MOD }: { mod?: string } = {}) {
  return [
    { keys: 'Arrow keys', does: 'Nudge the selected mark or word' },
    { keys: 'Shift + arrow keys', does: 'Nudge further' },
    { keys: 'Delete or Backspace', does: 'Remove the selected mark or word' },
    { keys: 'Esc', does: 'Deselect' },
    { keys: `${mod} + Z`, does: 'Undo' },
    { keys: `Shift + ${mod} + Z`, does: 'Redo' },
    { keys: 'Enter in the type field', does: 'Place the word on the active panel' },
  ]
}
