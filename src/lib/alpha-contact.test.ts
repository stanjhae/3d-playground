import { describe, expect, test } from 'vitest'

import { reportDesignHref } from './alpha-contact'

describe('reportDesignHref', () => {
  test('names the slug in an encoded mailto', () => {
    const href = reportDesignHref({ slug: '3f9a1c22b7e04d11', email: 'alpha@example.test' })

    expect(href).toMatch(/^mailto:alpha@example\.test\?subject=Report%20shared%20design%203f9a1c22b7e04d11&body=/)
    expect(decodeURIComponent(href!.split('body=')[1]!)).toContain('/s/3f9a1c22b7e04d11')
  })

  test('without a contact address there is no link', () => {
    expect(reportDesignHref({ slug: '3f9a1c22b7e04d11', email: null })).toBeNull()
  })
})
