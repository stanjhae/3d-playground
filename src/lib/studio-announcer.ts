import { create } from 'zustand'

/**
 * One polite live region for the studio (#157, #163): layer moves,
 * deletions and keyboard actions are announced here. `serial` changes on
 * every announcement so a repeated message is read again.
 */
export const useStudioAnnouncer = create<{
  message: string
  serial: number
  announce: ({ message }: { message: string }) => void
}>()((set) => ({
  message: '',
  serial: 0,
  announce: ({ message }) => {
    set((state) => ({ message, serial: state.serial + 1 }))
  },
}))

export function announce({ message }: { message: string }) {
  useStudioAnnouncer.getState().announce({ message })
}
