import { describe, expect, it } from 'vitest'

import { activeNav } from './active-nav'

describe('activeNav', () => {
  it('marks the tab each page belongs to', () => {
    expect(activeNav({ pathname: '/' })).toBe('home')
    expect(activeNav({ pathname: '/create', search: { cloud: 'x', step: 'design' } })).toBe('create')
    expect(activeNav({ pathname: '/studio', search: { new: true } })).toBe('create')
    expect(activeNav({ pathname: '/studio' })).toBe('studio')
    expect(activeNav({ pathname: '/vote' })).toBe('vote')
    expect(activeNav({ pathname: '/s/abc123' })).toBe('vote')
    expect(activeNav({ pathname: '/look/1' })).toBe('look')
    expect(activeNav({ pathname: '/privacy' })).toBeNull()
  })
})
