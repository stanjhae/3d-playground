import { create } from 'zustand'

/**
 * Whether the 3D preview can draw (R06 #168). The 2D Draw panels and
 * autosave never depend on this; the preview pane and publishing do.
 *
 * - `checking`: not probed yet.
 * - `ready`: a WebGL context exists and is drawing.
 * - `unsupported`: the browser or GPU gave no WebGL context at all.
 * - `lost`: the context was lost; the browser may restore it.
 */
export type WebglStatus = 'checking' | 'ready' | 'unsupported' | 'lost'

export type WebglEvent =
  | 'probe-ok'
  | 'probe-failed'
  | 'context-lost'
  | 'context-restored'
  | 'canvas-failed'

export function nextWebglStatus({
  status,
  event,
}: {
  status: WebglStatus
  event: WebglEvent
}): WebglStatus {
  switch (event) {
    case 'probe-ok':
      return status === 'checking' ? 'ready' : status
    case 'probe-failed':
    case 'canvas-failed':
      return 'unsupported'
    case 'context-lost':
      // No context means nothing to lose.
      return status === 'unsupported' ? status : 'lost'
    case 'context-restored':
      return status === 'lost' ? 'ready' : status
  }
}

export const WEBGL_COPY = {
  unsupported: {
    title: '3D preview unavailable',
    lead: 'This browser or device cannot show the 3D garment. You can keep drawing on the panels; your design still saves.',
  },
  lost: {
    title: '3D preview paused',
    lead: 'The graphics card stopped the 3D view. Keep drawing on the panels; your design still saves. The preview comes back on its own when the browser allows it.',
  },
  publishBlocked:
    'Publishing needs the 3D preview to capture the garment views. It will be available again when the preview is back.',
  publishUnsupported:
    'Publishing needs the 3D preview to capture the garment views. Open this design in a browser or device with 3D support to publish.',
} as const

/** Why publishing must wait, or null when the 3D canvas can capture. */
export function publishBlockedReason({ status }: { status: WebglStatus }) {
  if (status === 'ready') {
    return null
  }

  return status === 'unsupported' ? WEBGL_COPY.publishUnsupported : WEBGL_COPY.publishBlocked
}

type ContextProbe = {
  getContext: (kind: string) => unknown
}

/** True when a WebGL2 or WebGL1 context can be created. */
export function detectWebgl({
  createCanvas,
}: {
  createCanvas: () => ContextProbe | null
}) {
  try {
    const canvas = createCanvas()

    if (!canvas) {
      return false
    }

    const context = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as {
      getExtension?: (name: string) => { loseContext?: () => void } | null
    } | null

    if (!context) {
      return false
    }

    // Free the probe context; browsers cap how many can be live at once.
    context.getExtension?.('WEBGL_lose_context')?.loseContext?.()
    return true
  } catch {
    return false
  }
}

/**
 * Dev-only test hook: `?webgl=lost` loses the context right after the
 * canvas starts, `?webgl=none` behaves as if WebGL were missing. Ignored
 * in production builds.
 */
export type WebglTestMode = 'lost' | 'none' | null

export function webglTestMode({
  search,
  dev,
}: {
  search: string
  dev: boolean
}): WebglTestMode {
  if (!dev) {
    return null
  }

  const value = new URLSearchParams(search).get('webgl')
  return value === 'lost' || value === 'none' ? value : null
}

type WebglState = {
  status: WebglStatus
  /** Bumped on each restore so the canvas host remounts a fresh scene. */
  generation: number
  dispatch: (event: WebglEvent) => void
  retry: () => void
}

export const useWebglStore = create<WebglState>((set) => ({
  status: 'checking',
  generation: 0,
  dispatch: (event) =>
    set((state) => {
      const status = nextWebglStatus({ status: state.status, event })
      return {
        status,
        generation:
          event === 'context-restored' && status !== state.status
            ? state.generation + 1
            : state.generation,
      }
    }),
  // Manual retry after a loss the browser never restores.
  retry: () =>
    set((state) => ({
      status: state.status === 'unsupported' ? state.status : 'checking',
      generation: state.generation + 1,
    })),
}))
