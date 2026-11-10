import type { CreateStepId } from './create-steps'

/** Brief help for a first design (E13 #214). Each goes once dismissed. */
export const STUDIO_HINTS = [
  {
    id: 'panels',
    steps: ['design'],
    title: 'Pick a side',
    text: 'Press a panel to work on it. Sleeves are named as worn: the right sleeve is on the wearer’s right.',
  },
  {
    id: 'drawing',
    steps: ['design'],
    title: 'Draw',
    text: 'Draw on a panel or on the tee itself. Every change shows on the tee straight away.',
  },
  {
    id: 'precise',
    steps: ['design'],
    title: 'Add words and graphics',
    text: 'Choose Text, Graphics or Upload. Drag a piece to move it, and use its handles to size and rotate it.',
  },
  {
    id: 'saving',
    steps: ['design'],
    title: 'It saves itself',
    text: 'Changes save to your account as you work. History lets you go back to an earlier version.',
  },
  {
    id: 'publishing',
    steps: ['share'],
    title: 'Private until you publish',
    text: 'Publishing shares one saved version by link. Later edits stay private until you publish again.',
  },
] as const satisfies ReadonlyArray<{ id: string; steps: readonly CreateStepId[]; title: string; text: string }>

export type StudioHintId = (typeof STUDIO_HINTS)[number]['id']

const STORAGE_KEY = 'flp-hints-dismissed'
const ALL_HIDDEN = 'all'

/** Reads what this browser dismissed; storage may be unavailable. */
export function readDismissedHints({ storage }: { storage: Pick<Storage, 'getItem'> | null }) {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function writeDismissedHints({ storage, dismissed }: { storage: Pick<Storage, 'setItem'> | null; dismissed: string[] }) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(dismissed))
  } catch {
    // Hints just come back next time.
  }
}

export function allHintsHidden() {
  return [ALL_HIDDEN]
}

/** The next hint for this step, one at a time. */
export function nextHint({ step, dismissed }: { step: CreateStepId; dismissed: readonly string[] }) {
  if (dismissed.includes(ALL_HIDDEN)) {
    return null
  }

  return (
    STUDIO_HINTS.find(
      (hint) => (hint.steps as readonly CreateStepId[]).includes(step) && !dismissed.includes(hint.id),
    ) ?? null
  )
}

/** The control a hint is about carries `data-hint-anchor="<hint id>"` (P3). */
export const HINT_ANCHOR_ATTRIBUTE = 'data-hint-anchor'
/**
 * Places a floating hint must never cover: the work (the 3D stage and the
 * panels), the step buttons, the tools rail and any group of choices.
 */
export const HINT_KEEP_CLEAR_SELECTOR = 'canvas, [data-hint-keep-clear], [role="radiogroup"]'

export type HintBox = { left: number; top: number; width: number; height: number }
export type HintSide = 'below' | 'above' | 'right' | 'left'
export type HintPlacement = { side: HintSide; left: number; top: number; arrow: number }

const SIDES: readonly HintSide[] = ['below', 'above', 'right', 'left']

export function hintBoxesOverlap(a: HintBox, b: HintBox) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
}

function clamp({ value, min, max }: { value: number; min: number; max: number }) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Where the card goes on one side of the anchor, kept inside the screen. */
export function hintPosition({
  side,
  anchor,
  card,
  viewport,
  gap = 10,
  gutter = 16,
}: {
  side: HintSide
  anchor: HintBox
  card: { width: number; height: number }
  viewport: { width: number; height: number }
  gap?: number
  gutter?: number
}): HintPlacement {
  const vertical = side === 'below' || side === 'above'
  const left = vertical
    ? clamp({ value: anchor.left, min: gutter, max: viewport.width - gutter - card.width })
    : side === 'right'
      ? anchor.left + anchor.width + gap
      : anchor.left - gap - card.width
  const top = vertical
    ? side === 'below'
      ? anchor.top + anchor.height + gap
      : anchor.top - gap - card.height
    : clamp({ value: anchor.top, min: gutter, max: viewport.height - gutter - card.height })
  // The arrow points at the anchor's middle, or its first 2 rem when it is wide.
  const target = vertical
    ? anchor.left + Math.min(anchor.width / 2, 32) - left
    : anchor.top + Math.min(anchor.height / 2, 32) - top
  const span = vertical ? card.width : card.height

  return { side, left, top, arrow: clamp({ value: target, min: 14, max: span - 14 }) }
}

/**
 * The first side where the whole card is on screen and covers neither the
 * anchor nor anything kept clear; null when none does, and then the hint
 * stays in the tools rail instead (E13 #214: never over the work).
 */
export function placeHint({
  anchor,
  card,
  viewport,
  keepClear,
  gutter = 16,
}: {
  anchor: HintBox
  card: { width: number; height: number }
  viewport: { width: number; height: number }
  keepClear: readonly HintBox[]
  gutter?: number
}): HintPlacement | null {
  for (const side of SIDES) {
    const placed = hintPosition({ side, anchor, card, viewport, gutter })
    const box = { left: placed.left, top: placed.top, width: card.width, height: card.height }
    const onScreen =
      box.left >= gutter &&
      box.top >= gutter &&
      box.left + box.width <= viewport.width - gutter &&
      box.top + box.height <= viewport.height - gutter

    if (onScreen && !hintBoxesOverlap(box, anchor) && !keepClear.some((other) => hintBoxesOverlap(box, other))) {
      return placed
    }
  }

  return null
}
