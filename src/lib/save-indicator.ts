import { SERVER_FAILED_MESSAGE, type SaveState } from './save-controller'

/**
 * What the studio's save indicator says. A person should be able to say
 * where the work is:
 *
 * - Saving… (a change waiting its two seconds, or on the wire)
 * - Saved at {time}, with "Only you can see it" underneath
 * - Offline, when the copy is only on this device
 *
 * A rate limit or a passing server fault still says it will retry.
 * A save that stopped, or a newer version saved somewhere else, says so.
 * "Waiting for images" covers an upload that has not finished.
 * The indicator has a fixed size, so a change of state never moves the
 * buttons around it.
 */
/** Who can see the open design, for the line under Saved. */
export type SaveAudience = 'only-you' | 'link' | 'edits-private'

export type SaveIndicator = {
  label: string
  tone: 'quiet' | 'busy' | 'problem'
  /** Small second line: where the work is. */
  detail: string | null
  /** Fuller sentence for the tooltip and screen readers. */
  description: string | null
  /** Offer "Retry" (saves now instead of waiting for the retry). */
  canRetryNow: boolean
  /** A problem that waits on the creator; shown below the header. */
  needsAction: boolean
}

/** "Saved at 11:41 am", from the clock on `at` (the viewer's local time). */
export function savedAtLabel({ at }: { at: Date }) {
  const hours = at.getHours()
  const minutes = String(at.getMinutes()).padStart(2, '0')
  const suffix = hours >= 12 ? 'pm' : 'am'
  const hour = hours % 12 || 12
  return `Saved at ${hour}:${minutes} ${suffix}`
}

function savedDetail({ audience }: { audience: SaveAudience }) {
  if (audience === 'link') {
    return 'Anyone with the link can see it'
  }

  if (audience === 'edits-private') {
    return 'Latest edits stay private'
  }

  return 'Only you can see it'
}

export function saveIndicator({
  state,
  keptLocally,
  savedAt = null,
  audience = 'only-you',
}: {
  state: Pick<SaveState, 'status' | 'message'>
  keptLocally: boolean
  /** Server time of the saved head. Absent until that time is known. */
  savedAt?: Date | null
  audience?: SaveAudience
}): SaveIndicator {
  const detail = state.status !== 'saved' && keptLocally ? 'Only on this device' : null
  const base = { detail, description: state.message, canRetryNow: false, needsAction: false }

  switch (state.status) {
    case 'saved':
      return {
        ...base,
        label: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAtLabel({ at: savedAt }) : 'Saved',
        tone: 'quiet',
        detail: savedDetail({ audience }),
      }
    case 'unsaved':
    case 'saving':
      return { ...base, label: 'Saving…', tone: 'busy' }
    case 'waiting-for-images':
      return { ...base, label: 'Waiting for images', tone: 'busy' }
    case 'paused':
      // Rate limited: saving now would only be refused again.
      return { ...base, label: 'Couldn’t save, retrying', tone: 'problem' }
    case 'offline':
      return { ...base, label: 'Offline', tone: 'problem', canRetryNow: true }
    case 'failed':
      return state.message === SERVER_FAILED_MESSAGE
        ? { ...base, label: 'Couldn’t save, retrying', tone: 'problem', canRetryNow: true }
        : { ...base, label: 'Couldn’t save', tone: 'problem', canRetryNow: true, needsAction: true }
    case 'conflict':
      return { ...base, label: 'Changed elsewhere', tone: 'problem', needsAction: true }
  }
}
