import { SERVER_FAILED_MESSAGE, type SaveState } from './save-controller'

/**
 * What the studio's save indicator says (third outside test pass). Eight
 * controller states come down to five plain phrases in one place:
 *
 * - Saved privately
 * - Saving… (a change waiting its two seconds, or on the wire)
 * - Couldn't save, retrying (offline, rate limited, a passing server fault)
 * - Couldn't save (needs the creator; the reason shows below the header)
 * - Changed elsewhere (a newer version saved somewhere else)
 *
 * plus "Waiting for images" while an upload finishes. The indicator has a
 * fixed size, so a change of state never moves the buttons around it.
 */
export type SaveIndicator = {
  label: string
  tone: 'quiet' | 'busy' | 'problem'
  /** Small second line: whether the work is safe on this device. */
  detail: string | null
  /** Fuller sentence for the tooltip and screen readers. */
  description: string | null
  /** Offer "Try again" (saves now instead of waiting for the retry). */
  canRetryNow: boolean
  /** A problem that waits on the creator; shown below the header. */
  needsAction: boolean
}

export function saveIndicator({
  state,
  keptLocally,
}: {
  state: Pick<SaveState, 'status' | 'message'>
  keptLocally: boolean
}): SaveIndicator {
  const detail = state.status !== 'saved' && keptLocally ? 'Kept on this device' : null
  const base = { detail, description: state.message, canRetryNow: false, needsAction: false }

  switch (state.status) {
    case 'saved':
      return { ...base, label: 'Saved privately', tone: 'quiet', detail: null }
    case 'unsaved':
    case 'saving':
      return { ...base, label: 'Saving…', tone: 'busy' }
    case 'waiting-for-images':
      return { ...base, label: 'Waiting for images', tone: 'busy' }
    case 'paused':
      // Rate limited: saving now would only be refused again.
      return { ...base, label: 'Couldn’t save, retrying', tone: 'problem' }
    case 'offline':
      return { ...base, label: 'Couldn’t save, retrying', tone: 'problem', canRetryNow: true }
    case 'failed':
      return state.message === SERVER_FAILED_MESSAGE
        ? { ...base, label: 'Couldn’t save, retrying', tone: 'problem', canRetryNow: true }
        : { ...base, label: 'Couldn’t save', tone: 'problem', canRetryNow: true, needsAction: true }
    case 'conflict':
      return { ...base, label: 'Changed elsewhere', tone: 'problem', needsAction: true }
  }
}
