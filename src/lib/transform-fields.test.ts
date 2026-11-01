import { describe, expect, test } from 'vitest'

import {
  TRANSFORM_FIELDS,
  formatField,
  parseField,
  roundPlacement,
  stepField,
} from './transform-fields'

/** Numeric transform fields of the Tech inspector (#156). */

const { x, scale, rotation } = TRANSFORM_FIELDS

describe('parseField', () => {
  test('percent and degrees convert to store values', () => {
    expect(parseField({ field: x, text: '45' })).toEqual({ ok: true, value: 0.45 })
    expect(parseField({ field: x, text: ' 45.5 % ' })).toEqual({ ok: true, value: 0.455 })
    expect(parseField({ field: scale, text: '30' })).toEqual({ ok: true, value: 0.3 })
    expect(parseField({ field: rotation, text: '90°' })).toEqual({
      ok: true,
      value: roundPlacement({ value: Math.PI / 2 }),
    })
    expect(parseField({ field: rotation, text: '-180' })).toEqual({
      ok: true,
      value: roundPlacement({ value: -Math.PI }),
    })
  })

  test('the limits themselves are accepted', () => {
    expect(parseField({ field: x, text: '0' })).toEqual({ ok: true, value: 0 })
    expect(parseField({ field: x, text: '100' })).toEqual({ ok: true, value: 1 })
    expect(parseField({ field: scale, text: '5' })).toEqual({ ok: true, value: 0.05 })
  })

  test('out-of-range input is refused with a message, not clamped', () => {
    expect(parseField({ field: x, text: '101' })).toEqual({ ok: false, message: 'Use 0 to 100%.' })
    expect(parseField({ field: x, text: '-1' })).toEqual({ ok: false, message: 'Use 0 to 100%.' })
    expect(parseField({ field: scale, text: '4' })).toEqual({ ok: false, message: 'Use 5 to 80%.' })
    expect(parseField({ field: rotation, text: '181' })).toEqual({
      ok: false,
      message: 'Use -180 to 180°.',
    })
  })

  test('invalid input is refused', () => {
    for (const text of ['', ' ', 'abc', '1e2', '12px', '--3', '1.2.3', 'Infinity', 'NaN', '0x10']) {
      expect(parseField({ field: x, text })).toEqual({ ok: false, message: 'Enter a number.' })
    }
  })
})

describe('stepField', () => {
  test('arrows step one unit, Shift steps ten', () => {
    expect(stepField({ field: x, value: 0.38, direction: 1 })).toEqual({ ok: true, value: 0.39 })
    expect(stepField({ field: x, value: 0.38, direction: -1, large: true })).toEqual({ ok: true, value: 0.28 })
    expect(stepField({ field: rotation, value: 0, direction: 1 })).toEqual({
      ok: true,
      value: roundPlacement({ value: Math.PI / 180 }),
    })
  })

  test('repeated steps land on the typed value', () => {
    let value = 0.38

    for (let index = 0; index < 7; index += 1) {
      const next = stepField({ field: x, value, direction: 1 })
      value = next.ok ? next.value : value
    }

    expect(value).toBe(0.45)
    expect(value).toBe((parseField({ field: x, text: '45' }) as { value: number }).value)
  })

  test('a step past a limit is refused', () => {
    expect(stepField({ field: x, value: 1, direction: 1 })).toEqual({ ok: false, message: 'Use 0 to 100%.' })
    expect(stepField({ field: x, value: 0.95, direction: 1, large: true }).ok).toBe(false)
    expect(stepField({ field: x, value: 0.99, direction: 1 })).toEqual({ ok: true, value: 1 })
  })
})

describe('formatField', () => {
  test('shows at most one decimal, never -0', () => {
    expect(formatField({ field: x, value: 0.45372 })).toBe('45.4')
    expect(formatField({ field: x, value: 0.5 })).toBe('50')
    expect(formatField({ field: rotation, value: -0.0001 })).toBe('0')
    expect(formatField({ field: rotation, value: Math.PI })).toBe('180')
  })
})
