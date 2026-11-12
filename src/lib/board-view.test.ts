import { describe, expect, it } from 'vitest'

import { boardView } from './board-view'
import type { BoardEntry } from './flp-api/publication'

function entry(slug: string, votes: number, publishedAt: string, garmentId = 'tee'): BoardEntry {
  return { slug, title: slug, displayName: null, garmentId, votes, publishedAt, image: `/${slug}.jpg` }
}

const designs = [
  entry('a', 3, '2026-11-01T00:00:00Z'),
  entry('b', 9, '2026-11-03T00:00:00Z', 'hoodie'),
  entry('c', 3, '2026-11-05T00:00:00Z'),
  entry('d', 0, '2026-11-10T00:00:00Z'),
]

describe('boardView', () => {
  it('ranks by votes, ties sharing a rank, earliest first', () => {
    expect(boardView({ designs }).map(({ slug, rank }) => [slug, rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ])
  })

  it('keeps the overall rank when filtered by garment', () => {
    expect(boardView({ designs, garmentId: 'tee' }).map(({ slug, rank }) => [slug, rank])).toEqual([
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ])
  })

  it('lists newest first on the New tab', () => {
    expect(boardView({ designs, sort: 'new' }).map(({ slug }) => slug)).toEqual(['d', 'c', 'b', 'a'])
  })
})
