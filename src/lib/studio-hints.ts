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
