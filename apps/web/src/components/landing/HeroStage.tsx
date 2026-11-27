import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { detectWebgl, webglTestMode } from '../scene/webgl-status'
import { cn } from '../../lib/cn'
import { heroSceneTrigger, readHeroSceneSignals, whenIdle } from '../../lib/hero-scene-gate'
import { GRAPHIC_DROP_EVENT, type GraphicDropDetail, carriesGraphic, droppedGraphic } from '../../lib/graphic-drag'
import { LANDING_COPY } from '../../lib/landing-copy'
import { LANDING_VIEW_PANEL, landingClothOverrides, stampLandingGraphic } from '../../lib/landing-demo'
import { LANDING_TEE_COLOR, landingDemoDocument, useLandingDemoStore } from '../../lib/landing-demo-store'
import { HeroPoster } from './HeroPoster'
import { addLandingGraphic } from './HeroToolDock'

const LandingCloth = lazy(() => import('./LandingCloth'))
const COPY = LANDING_COPY.hero
/** How long "Loading 3D…" may show before the still picture stays, with a note. */
export const HERO_SCENE_TIMEOUT_MS = 15_000

/** A graphic let go over the stage but not the live tee: the middle of the side in view. */
function dropOnSide(src: string) {
  const store = useLandingDemoStore.getState()
  store.setDraggingGraphic(false)
  addLandingGraphic((previous) => stampLandingGraphic({ document: previous, src, panel: LANDING_VIEW_PANEL[store.side] }))
}

/** A failed scene (a lost context, a shader error) leaves the poster showing. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Said, not swallowed: a tester's "the demo doesn't work" needs a trace.
    console.warn('[hero] the 3D preview failed; showing the poster', error)
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
  const draggingGraphic = useLandingDemoStore((state) => state.draggingGraphic)
  const requestScene = useLandingDemoStore((state) => state.requestScene)
  const [webgl] = useState(() => {
    if (webglTestMode({ search: window.location.search, dev: import.meta.env.DEV }) === 'none') return false
    return detectWebgl({ createCanvas: () => window.document.createElement('canvas') })
  })
  const [signals] = useState(() => readHeroSceneSignals({ webgl }))
  const trigger = heroSceneTrigger(signals)
  const coarse = !signals.finePointer
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<false | 'error' | 'timeout'>(false)
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

  // A scene that never shows a frame (a stalled download, a hung GPU) gives
  // way to the still picture rather than "Loading 3D…" for ever.
  useEffect(() => {
    if (!mountScene || ready) return
    const timer = window.setTimeout(() => {
      console.warn('[hero] the 3D preview took too long to load; showing the poster')
      setFailed('timeout')
    }, HERO_SCENE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [mountScene, ready])

  // A finger's drop (`armTouchGraphicDrag`) that the live tee didn't take.
  useEffect(() => {
    const element = box.current

    if (!element) return

    function onTouchDrop(event: Event) {
      const detail = (event as CustomEvent<GraphicDropDetail>).detail
      detail.handled = true
      dropOnSide(detail.src)
    }

    element.addEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
    return () => element.removeEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
  }, [])

  return (
    <div
      ref={box}
      className={cn(
        'flv-stage relative mx-auto aspect-square w-full max-w-[36rem] overflow-hidden lg:max-w-[min(30rem,62vh)] rounded-[2rem] border border-flv-line bg-white shadow-[0_40px_80px_-30px_rgb(11_13_18_/0.35)]',
        // Where a dragged graphic can go.
        { 'outline-2 outline-offset-4 outline-flv-accent outline-dashed': draggingGraphic },
      )}
      data-drop-target={draggingGraphic ? '' : undefined}
      onPointerDown={() => {
        if (trigger !== 'never') requestScene()
      }}
      // A graphic dragged from the tools lands where it's let go on the live
      // tee (`LandingCloth`), else on the side the tee is showing.
      onDragOver={(event) => {
        if (carriesGraphic({ dataTransfer: event.dataTransfer })) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(event) => {
        const src = droppedGraphic({ dataTransfer: event.dataTransfer })

        if (!src) return
        event.preventDefault()
        dropOnSide(src)
      }}
    >
      <HeroPoster className={cn('transition-opacity duration-700', { 'opacity-0': ready })} />
      {mountScene ? (
        <div className={cn('absolute inset-0 transition-opacity duration-700', { 'opacity-0': !ready })}>
          <SceneBoundary onError={() => setFailed('error')}>
            <Suspense fallback={null}>
              <LandingCloth
                overrides={overrides}
                document={document}
                cameraView={cameraView ?? undefined}
                active={visible}
                interactive={ready}
                coarsePointer={coarse}
                onReady={() => setReady(true)}
                onLost={() => {
                  console.warn('[hero] the 3D preview lost its WebGL context; showing the poster')
                  setReady(false)
                  setFailed('error')
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
          // The way into the live demo on a phone, so it reads as the button it is.
          className="absolute bottom-4 left-1/2 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-flv-accent px-5 font-body text-base font-medium text-white shadow-md hover:brightness-110"
        >
          {COPY.spin}
        </button>
      ) : null}
      {failed ? (
        <p role="status" className="absolute inset-x-4 bottom-4 rounded-xl bg-white/90 p-3 text-center font-body text-xs text-flv-muted">
          {failed === 'timeout' ? COPY.sceneSlow : COPY.sceneFailed}
        </p>
      ) : null}
      {trigger === 'never' ? (
        <p className="absolute inset-x-4 bottom-4 rounded-xl bg-white/90 p-3 text-center font-body text-xs text-flv-muted">
          {COPY.noWebgl}
        </p>
      ) : null}
    </div>
  )
}
