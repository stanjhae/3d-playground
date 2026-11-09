import { describe, expect, test } from 'vitest'

import { ownsPageTitle, pageTitle, routeLabel } from './page-title'

describe('page titles', () => {
  test.each([
    ['/create', 'Create · Fashion Leader Vote'],
    ['/studio', 'My Studio · Fashion Leader Vote'],
    ['/studio/', 'My Studio · Fashion Leader Vote'],
    ['/sign-in', 'Sign in · Fashion Leader Vote'],
    ['/privacy', 'Privacy · Fashion Leader Vote'],
    ['/look/abc', 'Look · Fashion Leader Vote'],
    ['/', 'Fashion Leader Vote'],
    ['/nowhere', 'Fashion Leader Vote'],
  ])('%s', (pathname, title) => {
    expect(pageTitle({ label: routeLabel({ pathname }) })).toBe(title)
  })

  test('a shared design names itself', () => {
    expect(ownsPageTitle({ pathname: '/s/3f9a1c22b7e04d11' })).toBe(true)
    expect(ownsPageTitle({ pathname: '/studio' })).toBe(false)
  })
})
