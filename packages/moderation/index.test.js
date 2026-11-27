import { describe, expect, test } from 'vitest'

import { ModerationError, openReports, resolveReport, takeDownPublication } from './index.js'

const rpcClient = (result, calls = []) => ({
  rpc: (fn, args) => {
    calls.push({ fn, args })
    return { single: async () => result, then: (resolve) => resolve(result) }
  },
})

describe('moderation', () => {
  test('a takedown returns the hold in camel case', async () => {
    const calls = []
    const hold = await takeDownPublication({
      admin: rpcClient({ data: { slug: 's', reason: 'r', held_by: 'op', held_at: 't', cleared_by: null, cleared_at: null }, error: null }, calls),
      slug: 's',
      reason: 'r',
      heldBy: 'op',
    })
    expect(hold).toEqual({ slug: 's', reason: 'r', heldBy: 'op', heldAt: 't', clearedBy: null, clearedAt: null })
    expect(calls).toEqual([{ fn: 'flp_take_down_publication', args: { p_slug: 's', p_reason: 'r', p_held_by: 'op' } }])
  })

  test('a missing report is not_found', async () => {
    const failure = await resolveReport({ admin: rpcClient({ error: { code: 'FL404', message: 'x' } }), id: 'r', status: 'dismissed', resolvedBy: 'op' }).catch((error) => error)
    expect(failure).toBeInstanceOf(ModerationError)
    expect(failure.code).toBe('not_found')
  })

  test('the open queue maps comments and their hidden state', async () => {
    const row = { id: '1', slug: 's', comment_id: 'c', reason: 'spam', note: null, created_at: 't', publication_comments: { body: 'hi', hidden_at: 'x' } }
    const query = { select: () => query, eq: () => query, order: async () => ({ data: [row], error: null }) }
    const reports = await openReports({ admin: { from: () => query } })
    expect(reports).toEqual([{ id: '1', slug: 's', commentId: 'c', comment: { body: 'hi', hidden: true }, reason: 'spam', note: null, createdAt: 't' }])
  })
})
