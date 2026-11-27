import { describe, expect, test } from 'vitest'

import { SERVER_FAILED_MESSAGE, type SaveStatus } from './save-controller'
import { saveIndicator, savedAtLabel } from './save-indicator'
import { saveIndicatorClass } from './studio-chrome'

const label = (status: SaveStatus, message: string | null = null) =>
  saveIndicator({ state: { status, message }, keptLocally: false }).label

describe('save indicator', () => {
  test('eight save states come down to a few plain phrases', () => {
    expect(label('saved')).toBe('Saved')
    expect(savedAtLabel({ at: new Date(2026, 10, 20, 11, 41) })).toBe('Saved at 11:41 am')
    expect(
      saveIndicator({
        state: { status: 'saved', message: null },
        keptLocally: false,
        savedAt: new Date(2026, 10, 20, 11, 41),
      }).label,
    ).toBe('Saved at 11:41 am')
    expect(label('unsaved')).toBe('Saving…')
    expect(label('saving')).toBe('Saving…')
    expect(label('offline')).toBe('Offline')
    expect(label('paused')).toBe('Couldn’t save, retrying')
    expect(label('failed', SERVER_FAILED_MESSAGE)).toBe('Couldn’t save, retrying')
    expect(label('failed', 'Sign in required')).toBe('Couldn’t save')
    expect(label('conflict')).toBe('Changed elsewhere')
    expect(label('waiting-for-images')).toBe('Waiting for images')
  })

  test('only problems that wait on the creator go below the header', () => {
    const needs = (status: SaveStatus, message: string | null = null) =>
      saveIndicator({ state: { status, message }, keptLocally: false }).needsAction
    expect(needs('conflict')).toBe(true)
    expect(needs('failed', 'Sign in required')).toBe(true)
    expect(needs('failed', SERVER_FAILED_MESSAGE)).toBe(false)
    expect(needs('offline')).toBe(false)
    expect(needs('saving')).toBe(false)
  })

  test('says where the work is: on this device until saved, then only you can see it', () => {
    expect(saveIndicator({ state: { status: 'offline', message: null }, keptLocally: true }).detail).toBe(
      'Only on this device',
    )
    expect(saveIndicator({ state: { status: 'saved', message: null }, keptLocally: true }).detail).toBe(
      'Only you can see it',
    )
    expect(
      saveIndicator({ state: { status: 'saved', message: null }, keptLocally: false, audience: 'link' }).detail,
    ).toBe('Anyone with the link can see it')
    expect(
      saveIndicator({
        state: { status: 'saved', message: null },
        keptLocally: false,
        audience: 'edits-private',
      }).detail,
    ).toBe('Latest edits stay private')
  })

  test('Try again is offered only where saving now can help', () => {
    const retry = (status: SaveStatus) => saveIndicator({ state: { status, message: null }, keptLocally: false }).canRetryNow
    expect(retry('offline')).toBe(true)
    expect(retry('paused')).toBe(false)
    expect(retry('saving')).toBe(false)
    expect(retry('conflict')).toBe(false)
  })

  test('has a fixed size, so the header never changes height with it', () => {
    expect(saveIndicatorClass()).toMatch(/(^| )h-9( |$)/)
    expect(saveIndicatorClass()).toMatch(/(^| )w-\[11rem\]( |$)/)
    expect(saveIndicatorClass()).toMatch(/shrink-0/)
  })
})
