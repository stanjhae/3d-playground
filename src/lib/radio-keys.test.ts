import { describe, expect, test } from 'vitest'

import { nextRadioIndex, radioTabStop } from './radio-keys'

describe('nextRadioIndex', () => {
  test.each([
    ['ArrowRight', 0, 1],
    ['ArrowDown', 0, 1],
    ['ArrowLeft', 1, 0],
    ['ArrowUp', 1, 0],
    ['ArrowRight', 2, 0],
    ['ArrowLeft', 0, 2],
  ])('%s from %i goes to %i', (key, current, next) => {
    expect(nextRadioIndex({ key, current, count: 3 })).toBe(next)
  })

  test('other keys do nothing', () => {
    expect(nextRadioIndex({ key: 'Enter', current: 0, count: 3 })).toBeNull()
  })

  test('an empty group does nothing', () => {
    expect(nextRadioIndex({ key: 'ArrowRight', current: -1, count: 0 })).toBeNull()
  })

  test('a position outside the group starts from the ends', () => {
    expect(nextRadioIndex({ key: 'ArrowRight', current: -1, count: 3 })).toBe(0)
    expect(nextRadioIndex({ key: 'ArrowLeft', current: -1, count: 3 })).toBe(2)
  })
})

describe('radioTabStop', () => {
  test('is the checked radio', () => {
    expect(radioTabStop({ checked: [false, true, false] })).toBe(1)
  })

  test('is the first radio when none is checked', () => {
    expect(radioTabStop({ checked: [false, false] })).toBe(0)
  })
})
