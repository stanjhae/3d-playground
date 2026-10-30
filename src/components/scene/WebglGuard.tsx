import { useThree } from '@react-three/fiber'
import { Component, useEffect, useState, type ReactNode } from 'react'

import {
  WEBGL_COPY,
  detectWebgl,
  useWebglStore,
  webglTestMode,
} from './webgl-status'

const testMode = webglTestMode({
  search: typeof window === 'undefined' ? '' : window.location.search,
  dev: import.meta.env.DEV,
})

// The `?webgl=lost` hook fires once per page load, not on every remount.
let forcedLossDone = false

type LoseContext = { loseContext: () => void; restoreContext: () => void }

declare global {
  interface Window {
    /** Dev-only: drive context loss by hand (R06 #168). */
    __flpWebgl?: { lose: () => void; restore: () => void }
  }
}

/**
 * Lives inside the R3F Canvas: reports context loss and restore on the
 * renderer's canvas. Listeners come off before R3F disposes the renderer,
 * so the deliberate loss on unmount is not reported.
 */
export function WebglContextWatcher() {
  const gl = useThree((state) => state.gl)
  const dispatch = useWebglStore((state) => state.dispatch)

  useEffect(() => {
    const canvas = gl.domElement

    function onLost(event: Event) {
      // Without preventDefault the browser never restores the context.
      event.preventDefault()
      dispatch('context-lost')
    }

    function onRestored() {
      dispatch('context-restored')
    }

    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    dispatch('probe-ok')

    let ext: LoseContext | null = null

    if (import.meta.env.DEV) {
      ext = gl.getContext().getExtension('WEBGL_lose_context') as LoseContext | null
      window.__flpWebgl = {
        lose: () => ext?.loseContext(),
        restore: () => ext?.restoreContext(),
      }

      if (testMode === 'lost' && !forcedLossDone) {
        forcedLossDone = true
        ext?.loseContext()
      }
    }

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [dispatch, gl])

  return null
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function PreviewNotice({
  title,
  lead,
  onRetry,
}: {
  title: string
  lead: string
  onRetry?: () => void
}) {
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-flv-paper px-6 text-center"
    >
      <p className="font-display text-xs tracking-[0.22em] text-flv-accent uppercase">
        {title}
      </p>
      <p className="max-w-sm font-body text-sm text-flv-muted">{lead}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 px-3 font-body text-xs tracking-[0.1em] text-flv-ink uppercase underline underline-offset-4 hover:text-flv-accent"
        >
          Try again
        </button>
      ) : null}
    </div>
  )
}

/**
 * Mounts the 3D canvas only when WebGL exists, and shows a short static
 * explanation while it is missing or lost. `children` must render the R3F
 * Canvas with a `WebglContextWatcher` inside it.
 */
export function WebglGuard({ children }: { children: ReactNode }) {
  const status = useWebglStore((state) => state.status)
  const generation = useWebglStore((state) => state.generation)
  const dispatch = useWebglStore((state) => state.dispatch)
  const retry = useWebglStore((state) => state.retry)
  const [available] = useState(
    () =>
      testMode !== 'none' &&
      detectWebgl({ createCanvas: () => document.createElement('canvas') }),
  )

  useEffect(() => {
    if (!available) {
      dispatch('probe-failed')
    }
  }, [available, dispatch])

  // The status belongs to this canvas; the next studio starts fresh.
  useEffect(
    () => () => {
      useWebglStore.setState({ status: 'checking' })
    },
    [],
  )

  if (!available || status === 'unsupported') {
    return <PreviewNotice {...WEBGL_COPY.unsupported} />
  }

  return (
    <>
      <CanvasErrorBoundary key={generation} onError={() => dispatch('canvas-failed')}>
        {children}
      </CanvasErrorBoundary>
      {status === 'lost' ? <PreviewNotice {...WEBGL_COPY.lost} onRetry={retry} /> : null}
    </>
  )
}
