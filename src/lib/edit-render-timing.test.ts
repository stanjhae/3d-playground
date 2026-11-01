import { describe, expect, test } from 'vitest'

import { createEditRenderTiming } from './edit-render-timing'

function setup() {
  let time = 0
  const reports: number[] = []
  const timing = createEditRenderTiming({
    now: () => time,
    report: ({ ms }) => reports.push(ms),
  })

  return { timing, reports, at: (next: number) => (time = next) }
}

describe('edit to render (Q08 #193)', () => {
  test('times an edit to the next drawn frame', () => {
    const { timing, reports, at } = setup()

    at(10)
    timing.edited()
    at(42)
    timing.drew()

    expect(reports).toEqual([32])
  })

  test('a burst of edits counts once, from its first edit', () => {
    const { timing, reports, at } = setup()

    at(0)
    timing.edited()
    at(5)
    timing.edited()
    at(20)
    timing.drew()
    at(30)
    timing.drew()

    expect(reports).toEqual([20])
  })

  test('frames without an edit and waits while hidden are not counted', () => {
    const { timing, reports, at } = setup()

    timing.drew()
    timing.edited()
    timing.hidden()
    at(9000)
    timing.drew()

    expect(reports).toEqual([])
  })
})
