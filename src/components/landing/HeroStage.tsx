import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { detectWebgl, webglTestMode } from '../scene/webgl-status'
import { cn } from '../../lib/cn'
import { heroSceneTrigger, readHeroSceneSignals, whenIdle } from '../../lib/hero-scene-gate'
import { LANDING_COPY } from '../../lib/landing-copy'
import { landingClothOverrides } from '../../lib/landing-demo'
import { LANDING_TEE_COLOR, landingDemoDocument, useLandingDemoStore } from '../../lib/landing-demo-store'
import { HeroPoster } from './HeroPoster'

const LandingCloth = lazy(() => import('./LandingCloth'))
const COPY = LANDING_COPY.hero

/** A failed scene (a lost context, a shader error) leaves the poster showing. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
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

/**
 * The hero's tee: a baked poster first (the page's largest image), then the
 * live 3D scene fading in over it once `hero-scene-gate` says so.
 */
export function HeroStage() {
  const document = useLandingDemoStore((state) => state.document) ?? landingDemoDocument()
  const cameraView = useLandingDemoStore((state) => state.cameraView)
  const wantsScene = useLandingDemoStore((state) => state.wantsScene)
  const requestScene = useLandingDemoStore((state) => state.requestScene)
  const [webgl] = useState(() => {
    if (webglTestMode({ search: window.location.search, dev: import.meta.env.DEV }) === 'none') return false
    return detectWebgl({ createCanvas: () => window.document.createElement('canvas') })
  })
  const [signals] = useState(() => readHeroSceneSignals({ webgl }))
  const trigger = heroSceneTrigger(signals)
  const coarse = !signals.finePointer
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(true)
  const box = useRef<HTMLDivElement | null>(null)
  const overrides = useMemo(() => landingClothOverrides({ color: LANDING_TEE_COLOR, textureId: 'standard' }), [])

  useEffect(() => {
    if (trigger === 'idle' && !wantsScene) {
      return whenIdle({ run: requestScene })
    }
  }, [trigger, wantsScene, requestScene])

  useEffect(() => {
    const element = box.current

    if (!element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const mountScene = trigger !== 'never' && wantsScene && !failed

  return (
    <div
      ref={box}
      className="flv-stage relative mx-auto aspect-square w-full max-w-[36rem] overflow-hidden rounded-[2rem] border border-flv-line bg-white shadow-[0_40px_80px_-30px_rgb(11_13_18_/0.35)]"
      onPointerDown={() => {
        if (trigger !== 'never') requestScene()
      }}
    >
      <HeroPoster className={cn('transition-opacity duration-700', { 'opacity-0': ready })} />
      {mountScene ? (
        <div className={cn('absolute inset-0 transition-opacity duration-700', { 'opacity-0': !ready })}>
          <SceneBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <LandingCloth
                overrides={overrides}
                document={document}
                cameraView={cameraView ?? undefined}
                active={visible}
                coarsePointer={coarse}
                onReady={() => setReady(true)}
                onLost={() => {
                  setReady(false)
                  setFailed(true)
                }}
              />
            </Suspense>
          </SceneBoundary>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        {ready ? (
          <span className="flv-live-badge">{COPY.live}</span>
        ) : mountScene ? (
          <span className="flv-concept-badge">{COPY.loading}</span>
        ) : null}
      </div>
      {trigger === 'interaction' && !wantsScene ? (
        <button
          type="button"
          onClick={requestScene}
          className="absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-flv-line bg-white/90 px-4 font-body text-sm text-flv-ink shadow-sm backdrop-blur hover:border-flv-ink"
        >
          {COPY.spin}
        </button>
      ) : null}
      {trigger === 'never' ? (
        <p className="absolute inset-x-4 bottom-4 rounded-xl bg-white/90 p-3 text-center font-body text-xs text-flv-muted">
          {COPY.noWebgl}
        </p>
      ) : null}
    </div>
  )
}
