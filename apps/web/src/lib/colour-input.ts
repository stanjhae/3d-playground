import { create } from 'zustand'

/**
 * Pro colour entry (A5): hex typed by hand, the eyedropper, and the colours
 * used most recently. Recents are a per-browser convenience, never part of a
 * design.
 */

export const RECENT_LIMIT = 8
const STORAGE_KEY = 'flp.recentColours'

/** `#rgb`, `rgb`, `#rrggbb` or `rrggbb` → `#rrggbb` in lower case; anything else → null. */
export function normalizeHex({ text }: { text: string }): string | null {
  const raw = text.trim().replace(/^#/, '').toLowerCase()

  if (/^[0-9a-f]{6}$/.test(raw)) {
    return `#${raw}`
  }

  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${[...raw].map((digit) => digit + digit).join('')}`
  }

  return null
}

/** The new colour first, no repeats, at most `RECENT_LIMIT`. */
export function withRecent({ recents, color }: { recents: string[]; color: string }) {
  const hex = normalizeHex({ text: color })

  if (!hex) {
    return recents
  }

  return [hex, ...recents.filter((entry) => entry !== hex)].slice(0, RECENT_LIMIT)
}

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => (typeof entry === 'string' && normalizeHex({ text: entry }) ? [normalizeHex({ text: entry })!] : [])).slice(0, RECENT_LIMIT)
      : []
  } catch {
    return []
  }
}

export const useRecentColours = create<{ recents: string[]; use: ({ color }: { color: string }) => void }>((set) => ({
  recents: readStored(),
  use: ({ color }) => {
    set((state) => {
      const recents = withRecent({ recents: state.recents, color })

      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(recents))
      } catch {
        // Private windows and blocked storage just forget them.
      }

      return { recents }
    })
  },
}))

type EyeDropperResult = { sRGBHex: string }
type EyeDropperConstructor = new () => { open: () => Promise<EyeDropperResult> }

/** The browser's screen colour picker, where there is one (Chromium on desktop). */
export function eyeDropper(): EyeDropperConstructor | null {
  return typeof window !== 'undefined' && 'EyeDropper' in window
    ? ((window as unknown as { EyeDropper: EyeDropperConstructor }).EyeDropper)
    : null
}

/** Picks a colour from anywhere on screen; null when cancelled or unavailable. */
export async function pickScreenColour(): Promise<string | null> {
  const Dropper = eyeDropper()

  if (!Dropper) {
    return null
  }

  try {
    const { sRGBHex } = await new Dropper().open()
    return normalizeHex({ text: sRGBHex })
  } catch {
    // Escape, or the page lost focus.
    return null
  }
}
