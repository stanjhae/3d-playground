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
  | { type: 'duplicate' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'cancelStroke' }
  | { type: 'tool'; tool: StudioToolKey }
  /** Restack the selected item in its panel (A5). */
  | { type: 'arrange'; direction: 'up' | 'down' | 'front' | 'back' }
  /** Lock or unlock the selected item (W3). */
  | { type: 'lock' }

/** Single-letter tools, as in most drawing apps. */
export type StudioToolKey = 'brush' | 'eraser' | 'text' | 'graphics'

const TOOL_KEYS: Record<string, StudioToolKey> = {
  b: 'brush',
  e: 'eraser',
  t: 'text',
  g: 'graphics',
}

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

/** Text selected on the page: ⌘C should copy that, not the design. */
function hasTextSelection({ target }: { target: unknown }) {
  const view = (target as { ownerDocument?: { defaultView?: { getSelection?: () => { toString: () => string } | null } } } | null)
    ?.ownerDocument?.defaultView
  return Boolean(view?.getSelection?.()?.toString())
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
  drawing = false,
  canPaste = false,
  inDesign = true,
  canLock = false,
}: {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: unknown
  /** A placeable object (mark, word) is selected in the design step. */
  hasSelection: boolean
  /** A stroke is being drawn right now. */
  drawing?: boolean
  /** Something was copied this session. */
  canPaste?: boolean
  /** On the design step, where the drawing tools are. */
  inDesign?: boolean
  /** The selected item takes a lock: paint, a mark or a word. */
  canLock?: boolean
}): StudioKeyAction | null {
  // Esc drops a stroke mid-draw, wherever focus is.
  if (key === 'Escape' && drawing) {
    return { type: 'cancelStroke' }
  }

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

    // ] and [ move one place; with Shift (} and { on most layouts) all the way.
    if (hasSelection && (key === ']' || key === '}')) {
      return { type: 'arrange', direction: shiftKey ? 'front' : 'up' }
    }

    if (hasSelection && (key === '[' || key === '{')) {
      return { type: 'arrange', direction: shiftKey ? 'back' : 'down' }
    }

    if (shiftKey) {
      return null
    }

    // Without a selection these keep their browser meaning (bookmark, copy
    // page text), so they are only taken when they act on the design.
    if (lower === 'd' && hasSelection) {
      return { type: 'duplicate' }
    }

    if (lower === 'c' && hasSelection && !hasTextSelection({ target })) {
      return { type: 'copy' }
    }

    if (lower === 'v' && canPaste && inDesign) {
      return { type: 'paste' }
    }

    // Without one, ⌘L keeps the browser's address bar.
    if (lower === 'l' && canLock) {
      return { type: 'lock' }
    }

    return null
  }

  if (altKey) {
    return null
  }

  const tool = TOOL_KEYS[key]

  if (tool && !shiftKey && inDesign && !drawing) {
    return { type: 'tool', tool }
  }

  if (!hasSelection) {
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
    { keys: 'Esc', does: 'Cancel the stroke you are drawing, or deselect' },
    { keys: `${mod} + D`, does: 'Duplicate the selected mark or word' },
    { keys: `${mod} + C, then ${mod} + V`, does: 'Copy it, then paste onto the side you are working on' },
    { keys: 'B, E, T, G', does: 'Brush, eraser, text, graphics' },
    { keys: `${mod} + ] or ${mod} + [`, does: 'Bring the selected item forward, or send it back' },
    { keys: `Shift + ${mod} + ] or [`, does: 'Bring it to the front, or send it to the back' },
    { keys: `${mod} + L`, does: 'Lock the selected item, or unlock it' },
    { keys: `${mod} + Z`, does: 'Undo' },
    { keys: `Shift + ${mod} + Z`, does: 'Redo' },
    { keys: 'Enter in the type field', does: 'Place the word on the active panel' },
  ]
}
