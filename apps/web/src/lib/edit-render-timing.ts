import { type TimingEvent, trackTiming } from './assumption-events.ts'

/**
 * Edit to render (Q08 #193): from the first editor change since the last
 * drawn frame to the next one. Edits that land before that frame share
 * it, so a burst counts once from its first edit. A hidden page draws
 * nothing, so its wait is dropped rather than counted as slow.
 */
export function createEditRenderTiming({
  now = () => performance.now(),
  report = ({ name, ms }: { name: TimingEvent; ms: number }) => trackTiming({ name, ms }),
}: {
  now?: () => number
  report?: (timing: { name: TimingEvent; ms: number }) => void
} = {}) {
  let editedAt: number | null = null

  return {
    edited() {
      editedAt ??= now()
    },
    drew() {
      if (editedAt === null) {
        return
      }

      const ms = now() - editedAt
      editedAt = null
      report({ name: 'edit_render', ms })
    },
    hidden() {
      editedAt = null
    },
  }
}
