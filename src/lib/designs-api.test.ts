import { describe, expect, test } from 'vitest'

import { voteRequestPath } from './designs-api'

describe('voteRequestPath', () => {
  test('encodes ids so slashes stay one segment', () => {
    expect(voteRequestPath({ id: 'look-atelier-ivory' })).toBe(
      '/api/designs/look-atelier-ivory/vote',
    )
    expect(voteRequestPath({ id: 'look-foo/bar' })).toBe(
      '/api/designs/look-foo%2Fbar/vote',
    )
  })
})
