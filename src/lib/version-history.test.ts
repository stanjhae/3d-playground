import { describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import type { FlpResult } from './flp-api/client'
import type { VersionPage, VersionResponse, VersionSummary } from './flp-api/contract'
import type { SaveState } from './save-controller'
import {
  EMPTY_HISTORY,
  checkCheckpointName,
  formatVersionTime,
  mergeHistoryPage,
  previewVersion,
  restoreFromHistory,
  versionRow,
} from './version-history'

function version(seq: number, patch: Partial<VersionSummary> = {}): VersionSummary {
  return {
    seq,
    kind: 'autosave',
    label: null,
    contentHash: 'sha256:x',
    restoredFromSeq: null,
    createdAt: '2026-10-30T12:00:00.000Z',
    ...patch,
  }
}

function page(seqs: number[], nextBefore: number | null, headSeq = 9): VersionPage {
  return { headSeq, publishedSeq: 3, versions: seqs.map((seq) => version(seq)), nextBefore }
}

describe('history pages', () => {
  test('load more appends older pages newest-first and follows the cursor', () => {
    const first = mergeHistoryPage({ list: EMPTY_HISTORY, page: page([9, 8, 7], 7), append: false })
    const second = mergeHistoryPage({ list: first, page: page([6, 5, 4], 4), append: true })
    const last = mergeHistoryPage({ list: second, page: page([3, 2, 1], null), append: true })

    expect(first.versions.map((v) => v.seq)).toEqual([9, 8, 7])
    expect(second.nextBefore).toBe(4)
    expect(last.versions.map((v) => v.seq)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(last.nextBefore).toBeNull()
  })

  test('overlapping pages never duplicate a version', () => {
    const first = mergeHistoryPage({ list: EMPTY_HISTORY, page: page([9, 8], 8), append: false })
    const overlap = mergeHistoryPage({ list: first, page: page([8, 7], 7), append: true })

    expect(overlap.versions.map((v) => v.seq)).toEqual([9, 8, 7])
  })

  test('a refresh replaces the list with the newest page', () => {
    const loaded = mergeHistoryPage({ list: EMPTY_HISTORY, page: page([5, 4], 4, 5), append: false })
    const refreshed = mergeHistoryPage({ list: loaded, page: page([7, 6], 6, 7), append: false })

    expect(refreshed).toMatchObject({ headSeq: 7, nextBefore: 6 })
    expect(refreshed.versions.map((v) => v.seq)).toEqual([7, 6])
  })
})

describe('history rows', () => {
  const now = Date.parse('2026-10-30T12:30:00.000Z')

  test('show label, type, time and current/published/restored markers', () => {
    expect(
      versionRow({ version: version(9, { kind: 'restore', restoredFromSeq: 3 }), headSeq: 9, publishedSeq: 9, now }),
    ).toEqual({
      seq: 9,
      title: 'Version 9',
      kind: 'Restore',
      when: '30 min ago',
      badges: ['Current', 'Published', 'From v3'],
      canRestore: false,
    })
    expect(
      versionRow({ version: version(4, { kind: 'checkpoint', label: 'Before sleeves' }), headSeq: 9, publishedSeq: 3, now }),
    ).toMatchObject({ title: 'Before sleeves', kind: 'Checkpoint', badges: [], canRestore: true })
  })

  test('times read coarsely', () => {
    expect(formatVersionTime({ createdAt: '2026-10-30T12:29:40.000Z', now })).toBe('Just now')
    expect(formatVersionTime({ createdAt: '2026-10-30T09:00:00.000Z', now })).toBe('3 h ago')
    expect(formatVersionTime({ createdAt: 'nope', now })).toBe('')
  })

  test('checkpoint names are trimmed and validated like the server', () => {
    expect(checkCheckpointName({ name: '  Before   sleeves ' })).toEqual({ ok: true, label: 'Before sleeves' })
    expect(checkCheckpointName({ name: '   ' }).ok).toBe(false)
    expect(checkCheckpointName({ name: 'x'.repeat(61) }).ok).toBe(false)
  })
})

describe('read-only preview', () => {
  test('describes a version without changing it', () => {
    const document = structuredClone(GOLDEN_DOCUMENT)
    const before = JSON.stringify(document)
    const preview = previewVersion({ document })

    expect(JSON.stringify(document)).toBe(before)
    expect(preview.layerCount).toBe(
      Object.values(document.panels).reduce((sum, panel) => sum + panel.layers.length, 0),
    )
    expect(preview.panels.map((panel) => panel.panel)).toEqual(['front', 'back', 'left', 'right'])
  })
})

describe('restore flow (S08 #177)', () => {
  function fakeController(initial: Partial<SaveState> = {}, settleTo: Partial<SaveState> = {}) {
    let state: SaveState = { status: 'saved', savedRevision: 1, headSeq: 4, message: null, ...initial }
    const calls: string[] = []

    return {
      calls,
      controller: {
        getState: () => state,
        async settle() {
          calls.push('settle')
          state = { ...state, status: 'saved', headSeq: state.headSeq + 1, ...settleTo }
          return state
        },
        async hold() {
          calls.push('hold')
          return state
        },
        release() {
          calls.push('release')
        },
      },
    }
  }

  const restored: FlpResult<VersionResponse> = {
    ok: true,
    data: { designId: 'd', seq: 6, kind: 'restore', contentHash: 'sha256:x', restoredFromSeq: 2, createdAt: '' },
  }

  test('saves current work first, restores against the new head, then reloads', async () => {
    const { controller, calls } = fakeController({ status: 'unsaved' })
    const requests: unknown[] = []

    const outcome = await restoreFromHistory({
      fromSeq: 2,
      saveFirst: true,
      controller,
      mutationKey: 'k',
      restore: async (request) => {
        calls.push('restore')
        requests.push(request)
        return restored
      },
      reload: async () => {
        calls.push('reload')
        return true
      },
    })

    expect(calls).toEqual(['settle', 'hold', 'restore', 'reload'])
    expect(requests).toEqual([{ baseSeq: 5, fromSeq: 2, mutationKey: 'k' }])
    expect(outcome).toMatchObject({ ok: true, reloaded: true, version: { seq: 6, restoredFromSeq: 2 } })
  })

  test('stops before restoring when saving current work fails', async () => {
    const { controller, calls } = fakeController({ status: 'unsaved' }, { status: 'offline', message: 'Offline.' })

    const outcome = await restoreFromHistory({
      fromSeq: 2,
      saveFirst: true,
      controller,
      restore: async () => restored,
      reload: async () => true,
    })

    expect(calls).toEqual(['settle'])
    expect(outcome).toEqual({ ok: false, step: 'save', message: 'Offline.' })
  })

  test('discarding skips the save; a conflict releases autosave and never reloads', async () => {
    const { controller, calls } = fakeController({ status: 'unsaved' })

    const outcome = await restoreFromHistory({
      fromSeq: 2,
      saveFirst: false,
      controller,
      restore: async () => ({ ok: false, code: 'conflict', message: 'stale base version', headSeq: 9 }),
      reload: async () => {
        calls.push('reload')
        return true
      },
    })

    expect(calls).toEqual(['hold', 'release'])
    expect(outcome).toMatchObject({ ok: false, step: 'restore' })
  })

  test('refuses while the design is in conflict', async () => {
    const { controller, calls } = fakeController({ status: 'conflict' })

    const outcome = await restoreFromHistory({
      fromSeq: 2,
      saveFirst: true,
      controller,
      restore: async () => restored,
      reload: async () => true,
    })

    expect(calls).toEqual([])
    expect(outcome.ok).toBe(false)
  })
})
