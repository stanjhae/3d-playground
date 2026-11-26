import { Suspense, lazy, useEffect, useState } from 'react'

import {
  SHARE_VIEWS,
  afterStillsPaint,
  detectShare3dMode,
  type Share3dMode,
  type ShareViewPreset,
} from '../../lib/share-3d'

/**
 * The share page's big view: the front still as the poster, then, once the
 * stills have painted, the design in 3D over it (`ShareViewer`, its own
 * chunk). Without WebGL, or if anything in the 3D view fails, the poster
 * stays and the stills below are the page. Reduced motion, Save-Data and
 * small devices get a button instead of loading 3D by themselves.
 */

const ShareViewer = lazy(() => import('./ShareViewer'))

/** Must match `SHARE_STAGE_CLASS` in `flp-api/share-page.ts`, so the poster doesn't move on load. */
export const SHARE_STAGE_CLASS =
  'relative aspect-[4/5] w-full overflow-hidden border border-flv-line bg-flv-paper sm:aspect-[16/9]'

type StageState = 'poster' | 'ask' | 'loading' | 'ready' | 'failed'

const viewButtonClass =
  'inline-flex min-h-11 items-center justify-center border px-3 font-body text-xs tracking-[0.08em] uppercase aria-pressed:border-flv-ink aria-pressed:text-flv-ink'

export function ShareStage({ slug, seq, poster }: { slug: string; seq: number; poster: string }) {
  const [mode, setMode] = useState<Share3dMode | null>(null)
  const [stage, setStage] = useState<StageState>('poster')
  const [preset, setPreset] = useState<ShareViewPreset | null>('front')
  const [turn, setTurn] = useState(0)
  const [sleeves, setSleeves] = useState(true)

  useEffect(() => {
    const detected = detectShare3dMode()
    setMode(detected)

    if (detected === 'off') {
      return
    }

    if (detected === 'ask') {
      setStage('ask')
      return
    }

    // The 3D chunk waits for the stills, so it never competes with them.
    return afterStillsPaint({ run: () => setStage((current) => (current === 'poster' ? 'loading' : current)) })
  }, [])

  const viewerMounted = stage === 'loading' || stage === 'ready'

  return (
    <div className="flex flex-col gap-3">
      <div
        className={SHARE_STAGE_CLASS}
        role="group"
        aria-label={stage === 'ready' ? '3D view: drag to turn the garment' : 'Design view'}
        aria-busy={stage === 'loading'}
        data-testid="share-stage"
        data-stage={stage}
      >
        {/* Decorative: the same picture is in the views below, with its words. */}
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain" />
        {viewerMounted ? (
          <div
            className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${stage === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          >
            <Suspense fallback={null}>
              <ShareViewer
                slug={slug}
                seq={seq}
                preset={preset ?? 'front'}
                turn={turn}
                onReady={({ sleeves: hasSleeves }) => {
                  setSleeves(hasSleeves)
                  setStage('ready')
                }}
                onFail={() => setStage('failed')}
                onUnsupported={() => setStage('poster')}
                onHandTurn={() => setPreset(null)}
              />
            </Suspense>
          </div>
        ) : null}
        {stage === 'ask' ? (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center border border-flv-ink bg-flv-paper px-5 font-body text-xs tracking-[0.1em] uppercase hover:border-flv-accent hover:text-flv-accent"
              onClick={() => setStage('loading')}
            >
              Turn in 3D
            </button>
          </div>
        ) : null}
        <p role="status" className="absolute bottom-3 left-3 font-body text-xs text-flv-muted">
          {stage === 'loading' ? 'Loading the 3D view…' : stage === 'failed' ? 'The 3D view isn’t available here. The published views are below.' : ''}
        </p>
      </div>

      {stage === 'ready' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Turn to a view" className="flex flex-wrap gap-2">
            {SHARE_VIEWS.filter((view) => sleeves || !('sleeve' in view)).map((view) => (
              <button
                key={view.preset}
                type="button"
                aria-pressed={preset === view.preset}
                className={`${viewButtonClass} ${preset === view.preset ? '' : 'border-flv-line text-flv-muted hover:border-flv-accent hover:text-flv-accent'}`}
                onClick={() => {
                  setPreset(view.preset)
                  setTurn((count) => count + 1)
                }}
              >
                {view.label}
              </button>
            ))}
          </div>
          <p className="font-body text-xs text-flv-muted">Drag to turn</p>
        </div>
      ) : null}
      {mode === null ? null : <span hidden data-testid="share-3d-mode" data-mode={mode} />}
    </div>
  )
}
