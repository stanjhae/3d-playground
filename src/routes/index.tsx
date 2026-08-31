import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { FabricPanel } from '../components/editor/FabricPanel'
import { ModeToggle } from '../components/editor/ModeToggle'
import {
  PublishBar,
  PublishThumbnailSync,
} from '../components/editor/PublishBar'
import { SilhouetteSwitch } from '../components/editor/SilhouetteSwitch'
import { AtelierScene } from '../components/scene/AtelierScene'
import { createDesign, getDesign } from '../lib/designs-api'
import { useEditorStore } from '../lib/editor-store'
import { resolveFetchedLook } from '../lib/fetched-look'
import { HOUSE_COPY, remixCaption } from '../lib/house-copy'

export const Route = createFileRoute('/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { design?: string } => {
    if (typeof search.design === 'string' && search.design.length > 0) {
      return { design: search.design }
    }

    return {}
  },
  component: AtelierHome,
})

function AtelierHome() {
  const navigate = useNavigate()
  const { design: remixId } = Route.useSearch()
  const mode = useEditorStore((state) => state.mode)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [enteredLabel, setEnteredLabel] = useState<string | null>(null)
  const [remixTitle, setRemixTitle] = useState<string | null>(null)
  const [remixStatus, setRemixStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'missing' | 'error'
  >('idle')

  useEffect(() => {
    if (!remixId) {
      setRemixStatus('idle')
      setRemixTitle(null)
      return
    }

    let cancelled = false
    setRemixStatus('loading')

    void getDesign({ id: remixId })
      .then((design) => {
        if (cancelled) {
          return
        }

        const resolved = resolveFetchedLook({ failed: false, design })

        if (resolved.status === 'ready' && resolved.design) {
          useEditorStore.getState().loadDesign({ design: resolved.design })
          setRemixTitle(resolved.design.title)
          setRemixStatus('loaded')
          return
        }

        setRemixTitle(null)
        setRemixStatus(
          resolved.status === 'missing' ? 'missing' : 'error',
        )
      })
      .catch(() => {
        if (!cancelled) {
          setRemixTitle(null)
          setRemixStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [remixId])

  return (
    <section className="relative h-dvh overflow-hidden">
      <AtelierScene>
        <PublishThumbnailSync />
      </AtelierScene>
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto absolute top-20 left-4 flex flex-wrap items-center gap-6 lg:left-6">
          <ModeToggle mode={mode} />
          {mode === 'design' ? <SilhouetteSwitch /> : null}
          {remixStatus === 'loaded' && remixTitle ? (
            <p className="font-display text-xs tracking-[0.18em] text-brass uppercase">
              {remixCaption({ title: remixTitle })}
            </p>
          ) : null}
          {remixStatus === 'missing' ? (
            <p className="text-sm text-ivory-muted">
              {HOUSE_COPY.lookGone} {HOUSE_COPY.studioOpen}
            </p>
          ) : null}
          {remixStatus === 'error' ? (
            <p className="text-sm text-ivory-muted">
              {HOUSE_COPY.lookFailed} {HOUSE_COPY.studioOpen}
            </p>
          ) : null}
        </div>
        {mode === 'design' ? (
          <div className="pointer-events-auto absolute inset-x-4 bottom-4 flex flex-col gap-3 lg:contents">
            <div className="lg:absolute lg:top-24 lg:right-6 lg:w-72">
              <FabricPanel />
            </div>
            <div className="flex flex-col gap-3 lg:absolute lg:bottom-4 lg:left-6 lg:w-[28rem]">
              {publishError ? (
                <p className="text-sm text-ivory-muted">{publishError}</p>
              ) : null}
              {enteredLabel ? (
                <p className="font-display text-xs tracking-[0.18em] text-brass uppercase">
                  {enteredLabel}
                </p>
              ) : null}
              <PublishBar
                publishing={publishing}
                onPublish={async ({ design }) => {
                  setPublishError(null)
                  setPublishing(true)

                  try {
                    const created = await createDesign({ design })
                    useEditorStore.getState().publishLook({ design })
                    setEnteredLabel(HOUSE_COPY.entered)
                    await navigate({
                      to: '/vote',
                      search: { entered: created.id },
                    })
                  } catch (error) {
                    setPublishError(
                      error instanceof Error
                        ? error.message
                        : HOUSE_COPY.publishFailed,
                    )
                  } finally {
                    setPublishing(false)
                  }
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
