import { create } from 'zustand'

/**
 * Whether the keyboard shortcuts dialog is open. `?` toggles it from the
 * studio's key handler; the Shortcuts button by Undo and the one in the
 * Design rail open it (UX review, 26 Nov: the keys were undiscoverable).
 */
export const useShortcutsHelp = create<{
  open: boolean
  setOpen: ({ open }: { open: boolean }) => void
  toggle: () => void
}>()((set) => ({
  open: false,
  setOpen: ({ open }) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
