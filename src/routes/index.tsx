import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { DualStudio } from '../components/editor/DualStudio'
import { FabricPanel } from '../components/editor/FabricPanel'
import { LayerRail } from '../components/editor/LayerRail'
import { PaintToolbar } from '../components/editor/PaintToolbar'
import { StructureRail } from '../components/editor/StructureRail'
import { StudioViewToggle } from '../components/editor/StudioViewToggle'
import { VersionRail } from '../components/editor/VersionRail'
import { GownCredit } from '../components/editor/GownCredit'
import { ModeToggle } from '../components/editor/ModeToggle'
import {
  PublishBar,
  PublishThumbnailSync,
} from '../components/editor/PublishBar'
import { SilhouetteSwitch } from '../components/editor/SilhouetteSwitch'
import { AtelierScene } from '../components/scene/AtelierScene'
import { loadDraft, saveDraft } from '../lib/design-draft'
import { createDesign, getDesign } from '../lib/designs-api'
import { useEditorStore } from '../lib/editor-store'
import { garmentCanPaint } from '../lib/garments'
import { resolveFetchedLook } from '../lib/fetched-look'
import { HOUSE_COPY, remixCaption } from '../lib/house-copy'
import {
  coverHeaderSpacerClass,
  studioPhonePublishClass,
  studioPhoneToolsClass,
} from '../lib/studio-chrome'

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
  const garmentId = useEditorStore((state) => state.garmentId)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [enteredLabel, setEnteredLabel] = useState<string | null>(null)
  const [remixTitle, setRemixTitle] = useState<string | null>(null)
  const [remixStatus, setRemixStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'missing' | 'error'
  >('idle')

  useEffect(() => {
    let cancelled = false

    void loadDraft().then((draft) => {
      if (cancelled || !draft || remixId) {
        return
      }

      useEditorStore.getState().hydrateDocument({
        document: draft.document,
        garmentId: draft.garmentId,
      })
    })

    return () => {
      cancelled = true
    }
  }, [remixId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const state = useEditorStore.getState()
      void saveDraft({
        garmentId: state.garmentId,
        document: state.document,
      })
    }, 800)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

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
      <DualStudio>
        <AtelierScene>
          <PublishThumbnailSync />
        </AtelierScene>
      </DualStudio>
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col lg:block">
        <div
          aria-hidden
          className={coverHeaderSpacerClass()}
        />
        <div className="pointer-events-auto flex shrink-0 flex-col gap-2 bg-gradient-to-b from-atelier/80 to-transparent px-4 pt-1 pb-3 lg:absolute lg:top-20 lg:left-6 lg:flex-row lg:flex-wrap lg:items-center lg:gap-6 lg:bg-none lg:px-0 lg:pt-0 lg:pb-0">
          <ModeToggle mode={mode} />
          {mode === 'design' ? <SilhouetteSwitch /> : null}
          {mode === 'design' && garmentCanPaint({ garmentId }) ? (
            <StudioViewToggle />
          ) : null}
          {mode === 'design' ? (
            <GownCredit garmentId={garmentId} />
          ) : null}
          {remixStatus === 'loading' ? (
            <p className="font-body text-sm text-ivory-muted">
              {HOUSE_COPY.lookLoading}
            </p>
          ) : null}
          {remixStatus === 'loaded' && remixTitle ? (
            <p className="font-body text-xs tracking-[0.08em] text-brass uppercase">
              {remixCaption({ title: remixTitle })}
            </p>
          ) : null}
          {remixStatus === 'missing' ? (
            <p className="font-body text-sm text-ivory-muted">
              {HOUSE_COPY.lookGone} {HOUSE_COPY.studioOpen}
            </p>
          ) : null}
          {remixStatus === 'error' ? (
            <p className="font-body text-sm text-ivory-muted">
              {HOUSE_COPY.lookFailed} {HOUSE_COPY.studioOpen}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 lg:hidden" />
        {mode === 'design' ? (
          <>
            <div className={studioPhoneToolsClass()}>
              <FabricPanel />
              {garmentCanPaint({ garmentId }) ? (
                <>
                  <PaintToolbar />
                  <StructureRail />
                  <LayerRail />
                  <VersionRail />
                </>
              ) : null}
            </div>
            <div className={studioPhonePublishClass()}>
              {publishError ? (
                <p className="font-body text-sm text-ivory-muted">
                  {publishError}
                </p>
              ) : null}
              {enteredLabel ? (
                <p className="font-body text-xs tracking-[0.08em] text-brass uppercase">
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
          </>
        ) : null}
      </div>
    </section>
  )
}
