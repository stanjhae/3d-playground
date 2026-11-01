import { useSyncExternalStore } from 'react'

import type { CanonicalTextFace } from './canonical-document'

/**
 * Web font loading for text drawn into the atlas (#155). Canvas text never
 * waits for a font: drawn before its face (or the subset holding its
 * characters) has loaded, it comes out in a fallback and nothing redraws
 * it. So a word asks for its face here; until that face is in, callers
 * draw the fallback (the 2D panel) or leave the word out (the 3D view),
 * and every load that settles bumps `textFacesVersion`, which both watch
 * to redraw. A face that fails or takes too long settles as the fallback,
 * so a word is never left blank for good.
 */

const FAMILIES: Record<CanonicalTextFace, string> = {
  display: '"Cormorant Garamond"',
  sans: 'Outfit',
}

const FALLBACKS: Record<CanonicalTextFace, string> = {
  display: 'Palatino, "Iowan Old Style", Georgia, serif',
  sans: '"Avenir Next", "Segoe UI", system-ui, sans-serif',
}

/** How long a face may take before the word settles in the fallback. */
export const TEXT_FACE_TIMEOUT_MS = 3_000

export type TextFaceState = 'loading' | 'ready' | 'failed'

const settled = new Map<string, Exclude<TextFaceState, 'loading'>>()
const pending = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function bump() {
  version += 1

  for (const listener of listeners) {
    listener()
  }
}

function faceFont({ face, size }: { face: CanonicalTextFace; size: number }) {
  return `600 ${size}px ${FAMILIES[face]}`
}

type FontSet = Pick<FontFaceSet, 'check' | 'load'>

function fontSet(): FontSet | null {
  return typeof document !== 'undefined' && document.fonts ? document.fonts : null
}

/**
 * Whether `face` can draw `text` yet, starting its load if not. With no
 * font loading API at all the fallback is all there is ('failed').
 */
export function textFaceState({
  face,
  text,
  fonts = fontSet(),
}: {
  face: CanonicalTextFace
  text: string
  fonts?: FontSet | null
}): TextFaceState {
  const key = `${face}\u0000${text}`
  const known = settled.get(key)

  if (known) {
    return known
  }

  if (!fonts) {
    return 'failed'
  }

  const font = faceFont({ face, size: 32 })

  try {
    if (fonts.check(font, text)) {
      settled.set(key, 'ready')
      return 'ready'
    }
  } catch {
    settled.set(key, 'failed')
    return 'failed'
  }

  if (!pending.has(key)) {
    pending.add(key)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'failed'>((resolve) => {
      timer = setTimeout(() => resolve('failed'), TEXT_FACE_TIMEOUT_MS)
    })
    const load = fonts.load(font, text).then(
      (faces): TextFaceState => (faces.length > 0 ? 'ready' : 'failed'),
      (): TextFaceState => 'failed',
    )

    void Promise.race([load, timeout]).then((state) => {
      clearTimeout(timer)
      pending.delete(key)
      settled.set(key, state === 'ready' ? 'ready' : 'failed')
      bump()
    })
  }

  return 'loading'
}

/** The canvas font for a word: its face once loaded, else the fallback. */
export function textCanvasFont({
  face,
  size,
  state,
}: {
  face: CanonicalTextFace
  size: number
  state: TextFaceState
}) {
  return state === 'ready'
    ? `600 ${size}px ${FAMILIES[face]}, ${FALLBACKS[face]}`
    : `600 ${size}px ${FALLBACKS[face]}`
}

export function textFacesVersion() {
  return version
}

export function subscribeTextFaces(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Re-renders when any face finishes loading (or gives up). */
export function useTextFacesVersion() {
  return useSyncExternalStore(subscribeTextFaces, textFacesVersion, textFacesVersion)
}

/** Test seam: forget every load. */
export function resetTextFaces() {
  settled.clear()
  pending.clear()
}
