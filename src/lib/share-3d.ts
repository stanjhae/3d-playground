import type { PublicScene } from './flp-api/public-scene'

/**
 * The share page's 3D view, the part that loads with the page: whether to
 * offer it, and the views it turns to. The viewer itself (three.js, the
 * garment, the renderer) is its own chunk, loaded only after the stills
 * have painted (`ShareViewer.tsx`).
 */

/**
 * How the page treats the 3D view:
 * - `auto`: loads by itself once the stills are up.
 * - `ask`: a "Turn in 3D" button; nothing loads until it's pressed. For
 *   reduced motion, Save-Data and small devices, where the stills are the
 *   better default.
 * - `off`: no WebGL; the stills are the page.
 */
export type Share3dMode = 'auto' | 'ask' | 'off'

export function share3dMode({
  webgl,
  reducedMotion,
  saveData = false,
  deviceMemory,
  cores,
}: {
  webgl: boolean
  reducedMotion: boolean
  saveData?: boolean
  /** `navigator.deviceMemory` in GB, where the browser reports it. */
  deviceMemory?: number
  cores?: number
}): Share3dMode {
  if (!webgl) {
    return 'off'
  }

  const slow = (deviceMemory !== undefined && deviceMemory < 4) || (cores !== undefined && cores <= 2)
  return reducedMotion || saveData || slow ? 'ask' : 'auto'
}

/** Whether this browser can make a WebGL context; the probe's context is freed at once. */
export function canUseWebgl() {
  try {
    const canvas = document.createElement('canvas')
    const context = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null

    if (!context) {
      return false
    }

    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** The page's mode in this browser. */
export function detectShare3dMode(): Share3dMode {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }

  return share3dMode({
    webgl: canUseWebgl(),
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    saveData: nav.connection?.saveData ?? false,
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
  })
}

/**
 * The views the 3D buttons turn to, named like the stills. Sleeves are
 * named from the wearer's side: render `left` is the wearer's right (#179).
 */
export const SHARE_VIEWS = [
  { preset: 'front', label: 'Front' },
  { preset: 'threeQuarter', label: '3/4' },
  { preset: 'back', label: 'Back' },
  { preset: 'left', label: "Wearer's right", sleeve: true },
  { preset: 'right', label: "Wearer's left", sleeve: true },
] as const

export type ShareViewPreset = (typeof SHARE_VIEWS)[number]['preset']

/** Runs `run` once the page has loaded and the main thread is idle (or after `timeout`). */
export function afterStillsPaint({ run, timeout = 2_000 }: { run: () => void; timeout?: number }) {
  let cancelled = false
  let idle: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (cancelled) {
      return
    }

    if ('requestIdleCallback' in window) {
      idle = window.requestIdleCallback(() => !cancelled && run(), { timeout })
    } else {
      timer = setTimeout(() => !cancelled && run(), 200)
    }
  }

  if (document.readyState === 'complete') {
    schedule()
  } else {
    window.addEventListener('load', schedule, { once: true })
  }

  return () => {
    cancelled = true
    window.removeEventListener('load', schedule)

    if (idle !== null) {
      window.cancelIdleCallback(idle)
    }

    if (timer !== null) {
      clearTimeout(timer)
    }
  }
}

export type PublicSceneResult = { ok: true; scene: PublicScene } | { ok: false }

/** The published design for the 3D view, pinned to the version the stills show. */
export async function getPublicScene({
  slug,
  seq,
  fetchImpl = fetch,
}: {
  slug: string
  seq: number
  fetchImpl?: typeof fetch
}): Promise<PublicSceneResult> {
  try {
    const response = await fetchImpl(`/api/flp/public/${encodeURIComponent(slug)}/scene?seq=${seq}`)

    if (!response.ok) {
      return { ok: false }
    }

    const scene = (await response.json()) as PublicScene
    return scene && scene.seq === seq && typeof scene.document === 'object' ? { ok: true, scene } : { ok: false }
  } catch {
    return { ok: false }
  }
}
