import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { FabricPanel } from '../components/editor/FabricPanel'
import { ModeToggle } from '../components/editor/ModeToggle'
import {
  PublishBar,
  PublishThumbnailSync,
} from '../components/editor/PublishBar'
import { AtelierScene } from '../components/scene/AtelierScene'
import { createDesign, getDesign } from '../lib/designs-api'
import { useEditorStore } from '../lib/editor-store'
import { resolveFetchedLook } from '../lib/fetched-look'

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
  const [remixStatus, setRemixStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'missing' | 'error'
  >('idle')

  useEffect(() => {
    if (!remixId) {
      setRemixStatus('idle')
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
          setRemixStatus('loaded')
          return
        }

        setRemixStatus(
          resolved.status === 'missing' ? 'missing' : 'error',
        )
      })
      .catch(() => {
        if (!cancelled) {
          setRemixStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [remixId])

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Fashion Leader Vote
      </p>
      <h1 className="max-w-xl font-display text-5xl leading-tight text-ivory">
        Design a look. Publish it. Name a Leader.
      </h1>
      <p className="max-w-lg text-base leading-relaxed text-ivory-muted">
        The atelier opens on a garment, not a campus tour. Click a panel, then
        a cloth name. Walk mode stays optional.
      </p>
      {remixStatus === 'missing' ? (
        <p className="text-sm text-ivory-muted">
          That look is gone. The studio is open on a fresh gown.
        </p>
      ) : null}
      {remixStatus === 'error' ? (
        <p className="text-sm text-ivory-muted">
          The look could not be opened. The studio is still here.
        </p>
      ) : null}
      <ModeToggle mode={mode} />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="h-[min(72vh,44rem)] overflow-hidden border border-atelier-line bg-atelier-raised">
          <AtelierScene>
            <PublishThumbnailSync />
          </AtelierScene>
        </section>
        <FabricPanel />
      </section>
      {publishError ? (
        <p className="text-sm text-ivory-muted">{publishError}</p>
      ) : null}
      <PublishBar
        publishing={publishing}
        onPublish={async ({ design }) => {
          setPublishError(null)
          setPublishing(true)

          try {
            await createDesign({ design })
            useEditorStore.getState().publishLook({ design })
            await navigate({ to: '/vote' })
          } catch {
            setPublishError('The look could not enter the vote. Try again.')
            throw new Error('The look could not be published')
          } finally {
            setPublishing(false)
          }
        }}
      />
    </section>
  )
}
