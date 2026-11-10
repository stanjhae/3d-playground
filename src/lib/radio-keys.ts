/** Arrow-key movement for `role="radio"` groups; `RadioGroup` applies it. */

const STEP: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/** The radio an arrow key moves to, wrapping; null for any other key. */
export function nextRadioIndex({ key, current, count }: { key: string; current: number; count: number }) {
  const step = STEP[key]

  if (!step || count === 0) {
    return null
  }

  // Focus outside the enabled radios starts from the ends.
  if (current < 0) {
    return step === 1 ? 0 : count - 1
  }

  return (current + step + count) % count
}

/** A radio group is one Tab stop: the checked radio, else the first. */
export function radioTabStop({ checked }: { checked: boolean[] }) {
  return Math.max(checked.indexOf(true), 0)
}
