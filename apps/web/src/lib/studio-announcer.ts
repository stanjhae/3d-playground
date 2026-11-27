import { create } from 'zustand'

/**
 * One polite live region for the studio (#157, #163): layer moves,
 * deletions and keyboard actions are announced here. `serial` changes on
 * every announcement so a repeated message is read again. A `notice` is
 * also shown on screen for a moment, for what a pointer press did not do
 * (a locked item that would not move).
 */
export const useStudioAnnouncer = create<{
  message: string
  serial: number
  notice: string | null
  announce: ({ message }: { message: string }) => void
}>()((set) => ({
  message: '',
  serial: 0,
  notice: null,
  announce: ({ message }) => {
    set((state) => ({ message, serial: state.serial + 1 }))
  },
}))

export function announce({ message }: { message: string }) {
  useStudioAnnouncer.getState().announce({ message })
}

/** How long an on-screen notice stays up. */
export const NOTICE_MS = 3200
let noticeTimer: ReturnType<typeof setTimeout> | null = null

/** Says `message` aloud and shows it on screen for a moment. */
export function flashNotice({ message }: { message: string }) {
  announce({ message })
  useStudioAnnouncer.setState({ notice: message })

  if (noticeTimer !== null) {
    clearTimeout(noticeTimer)
  }

  noticeTimer = setTimeout(() => {
    noticeTimer = null
    useStudioAnnouncer.setState({ notice: null })
  }, NOTICE_MS)
}

/** What a press on a locked item says instead of moving it (W3). */
export const LOCKED_NOTICE = 'Locked: unlock in Layers to move'
