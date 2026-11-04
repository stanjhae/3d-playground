/**
 * Numeric transform fields for the Tech inspector (#156). The inspector
 * shows each placement value in a unit people type (percent, degrees);
 * this file converts between those and the store's values, refuses input
 * it cannot take, and steps values for the arrow keys. It stays free of
 * React so it can be unit tested.
 */

import { HOUSE_COPY } from './house-copy'

export type TransformKey = 'x' | 'y' | 'scale' | 'rotation'

export type TransformField = {
  key: TransformKey
  /** The visible name, which also names the slider. */
  name: string
  /** Accessible name of the number box: the visible name and its unit. */
  label: string
  unit: string
  /** Inclusive limits, in display units. */
  min: number
  max: number
  toDisplay: (value: number) => number
  fromDisplay: (value: number) => number
}

const percent = {
  toDisplay: (value: number) => value * 100,
  fromDisplay: (value: number) => value / 100,
}

const degrees = {
  toDisplay: (value: number) => (value * 180) / Math.PI,
  fromDisplay: (value: number) => (value * Math.PI) / 180,
}

/** The same ranges as the inspector's sliders. */
export const TRANSFORM_FIELDS: Record<TransformKey, TransformField> = {
  x: {
    key: 'x',
    name: `${HOUSE_COPY.position} X`,
    label: `${HOUSE_COPY.position} X, percent of panel`,
    unit: '%',
    min: 0,
    max: 100,
    ...percent,
  },
  y: {
    key: 'y',
    name: `${HOUSE_COPY.position} Y`,
    label: `${HOUSE_COPY.position} Y, percent of panel`,
    unit: '%',
    min: 0,
    max: 100,
    ...percent,
  },
  scale: {
    key: 'scale',
    name: HOUSE_COPY.size,
    label: `${HOUSE_COPY.size}, percent`,
    unit: '%',
    min: 5,
    max: 80,
    ...percent,
  },
  rotation: {
    key: 'rotation',
    name: HOUSE_COPY.rotation,
    label: `${HOUSE_COPY.rotation}, degrees`,
    unit: '°',
    min: -180,
    max: 180,
    ...degrees,
  },
}

/** Arrow keys step this many display units; Shift steps the large one. */
export const FIELD_STEP = 1
export const FIELD_STEP_LARGE = 10

/**
 * Placement values are kept to this many decimals, so a value reached by
 * repeated steps (0.38 + 7 × 0.01) is the same number as one typed (0.45).
 */
const PLACEMENT_DECIMALS = 6

export function roundPlacement({ value }: { value: number }) {
  const factor = 10 ** PLACEMENT_DECIMALS
  return Math.round(value * factor) / factor
}

/** The text a field shows for a store value: at most one decimal. */
export function formatField({ field, value }: { field: TransformField; value: number }) {
  const shown = Math.round(field.toDisplay(value) * 10) / 10
  // Avoid "-0".
  return String(Object.is(shown, -0) ? 0 : shown)
}

export type FieldParse =
  | { ok: true; value: number }
  | { ok: false; message: string }

/**
 * Parse typed text to a store value. Invalid or out-of-range input is
 * refused with a short message, never clamped.
 */
export function parseField({ field, text }: { field: TransformField; text: string }): FieldParse {
  const trimmed = text.trim().replace(/[%°]$/, '').trim()

  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return { ok: false, message: 'Enter a number.' }
  }

  const display = Number(trimmed)

  if (!Number.isFinite(display)) {
    return { ok: false, message: 'Enter a number.' }
  }

  if (display < field.min || display > field.max) {
    return {
      ok: false,
      message: `Use ${field.min} to ${field.max}${field.unit}.`,
    }
  }

  return { ok: true, value: roundPlacement({ value: field.fromDisplay(display) }) }
}

/**
 * The value one arrow press reaches from `value`, or a refusal at the
 * field's limits. Steps are taken from the stored value, so a step on X
 * or Y lands where a canvas nudge of the same size does.
 */
export function stepField({
  field,
  value,
  direction,
  large = false,
}: {
  field: TransformField
  value: number
  direction: 1 | -1
  large?: boolean
}): FieldParse {
  const display = field.toDisplay(value) + direction * (large ? FIELD_STEP_LARGE : FIELD_STEP)
  // Drop float noise (100.00000000000001, or -20.0000015° from a stored
  // radian), so steps stay on whole units and the limits hold exactly.
  // Four display decimals keep the six of a stored percent.
  const nearest = Math.round(display * 1e4) / 1e4

  if (nearest < field.min || nearest > field.max) {
    return {
      ok: false,
      message: `Use ${field.min} to ${field.max}${field.unit}.`,
    }
  }

  return { ok: true, value: roundPlacement({ value: field.fromDisplay(nearest) }) }
}
