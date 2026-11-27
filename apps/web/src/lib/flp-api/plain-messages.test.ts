import { describe, expect, test } from 'vitest'

import { API_ERROR_STATUS } from './contract'
import { failureSentence, plainApiMessage } from './plain-messages'

describe('plainApiMessage', () => {
  test.each(Object.keys(API_ERROR_STATUS))('never shows the code %s', (code) => {
    const message = plainApiMessage({ code, message: code })

    expect(message).not.toContain(code)
    expect(message).toMatch(/^[A-Z].*\.$/)
  })

  test.each(['stale base version', 'mutation key already used', 'Request is invalid', 'some_new_code', ''])(
    'replaces %j',
    (message) => {
      expect(plainApiMessage({ code: 'conflict', message })).toBe('This changed somewhere else. Reload the page and try again.')
    },
  )

  test('says how long to wait when the server does', () => {
    expect(plainApiMessage({ code: 'rate_limited', message: 'Too many requests. Your work is kept; it will retry shortly.', retryAfter: 6 })).toBe(
      'Too many requests. Wait 6 seconds and try again.',
    )
    expect(plainApiMessage({ code: 'rate_limited', message: undefined, retryAfter: 1 })).toBe(
      'Too many requests. Wait 1 second and try again.',
    )
  })

  test('keeps messages written for people', () => {
    const quota = 'You have 20 designs, the most an account can keep. Delete one to create another.'

    expect(plainApiMessage({ code: 'quota_exceeded', message: quota })).toBe(quota)
    expect(plainApiMessage({ code: 'too_large', message: 'Images must be 10 MB or smaller' })).toBe('Images must be 10 MB or smaller')
  })

  test('capitalizes the database’s lower-case sentences', () => {
    expect(plainApiMessage({ code: 'invalid', message: 'title must be 1 to 80 characters' })).toBe('Title must be 1 to 80 characters')
  })

  test('an unknown code with no message still reads plainly', () => {
    expect(plainApiMessage({ code: 'teapot', message: undefined })).toBe('Something went wrong on our side. Try again.')
  })
})

describe('failureSentence', () => {
  test('joins without doubling the full stop', () => {
    expect(failureSentence({ lead: 'Not renamed', reason: 'Too many requests.' })).toBe('Not renamed. Too many requests.')
    expect(failureSentence({ lead: 'Not renamed', reason: 'Design not found' })).toBe('Not renamed. Design not found.')
  })
})
