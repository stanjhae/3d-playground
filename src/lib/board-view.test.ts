import { describe, expect, it } from 'vitest'

import { boardView } from './board-view'
import type { BoardEntry } from './flp-api/publication'

function entry(slug: string, votes: number, rank: number, publishedAt: string): BoardEntry {
  return { slug, title: slug, displayName: null, garmentId: 'tee', votes, rank, ownerHandle: null, publishedAt, image: `/${slug}.jpg` }
}

const designs = [
  entry('b', 9, 1, '2026-11-03T00:00:00Z'),
  entry('a', 3, 2, '2026-11-01T00:00:00Z'),
  entry('c', 3, 2, '2026-11-05T00:00:00Z'),
  entry('d', 0, 4, '2026-11-10T00:00:00Z'),
]

describe('boardView', () => {
  it('keeps the server ranking on the Rankings tab', () => {
    expect(boardView({ designs }).map(({ slug, rank }) => [slug, rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ])
  })

  it('lists newest first on the New tab', () => {
    expect(boardView({ designs, sort: 'new' }).map(({ slug }) => slug)).toEqual(['d', 'c', 'b', 'a'])
  })
})
