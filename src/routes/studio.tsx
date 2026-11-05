import { firstCreateStep, useStudioMode } from '../lib/studio-mode'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RequireSession } from '../components/auth/RequireSession'
import { DesignCard } from '../components/studio/DesignCard'
import { ImportPreview } from '../components/studio/ImportPreview'
import { PublicName } from '../components/studio/PublicName'
import { useSessionStore, waitForSession } from '../lib/auth/session-store'
import { authConfigured, getSupabaseClient } from '../lib/auth/supabase-client'
import { createEmptyCanonicalDocument } from '../lib/canonical-document'
import {
  type DesignSummary,
  createOwnedDesign,
  listOwnedDesigns,
} from '../lib/flp-api/client'
import { consumeLandingHandoff, peekLandingHandoff } from '../lib/landing-handoff'
import type { CanonicalDocument } from '../lib/canonical-document'
import type { PendingAsset } from '../lib/legacy-import'
import { uploadPendingAssets } from '../lib/legacy-assets'
import { initialStudioDocument } from '../lib/studio-create'
import { EXAMPLE_DESIGN_TITLE, createExampleDocument } from '../lib/example-design'
import { resolveTemplate } from '../lib/template-manifest'
import { trackAssumption } from '../lib/assumption-events'

export const Route = createFileRoute('/studio')({
  beforeLoad: async ({ location }) => {
    if (!authConfigured()) {
      return
    }

    const session = await waitForSession({ client: getSupabaseClient() })

    if (session.status !== 'signed-in') {
      throw redirect({ to: '/sign-in', search: { returnTo: location.href } })
    }
  },
  component: GuardedStudio,
})

// Only templates this app can open are offered (F07 #142).
const TEE = resolveTemplate(createEmptyCanonicalDocument().template)

const buttonClass =
  'flv-cta inline-flex min-h-11 items-center justify-center px-5 font-body text-sm font-medium disabled:opacity-50'

function GuardedStudio() {
  if (!authConfigured()) {
    return (
      <section className="mx-auto max-w-xl px-4 py-24 font-body text-sm text-flv-muted">
        Cloud designs are not available in this environment.
      </section>
    )
  }

  return (
    <RequireSession>
      <MyStudio />
    </RequireSession>
  )
}

type ListState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; designs: DesignSummary[] }

function MyStudio() {
  const navigate = useNavigate()
  const accountEpoch = useSessionStore((state) => state.accountEpoch)
  const ownerId = useSessionStore((state) => state.account?.userId ?? null)
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [landing] = useState(() => peekLandingHandoff())
  // A landing design is shown before and after conversion, then created
  // only when the person chooses (F06 #141).
  const conversion = useMemo(() => (landing ? initialStudioDocument({ handoff: landing }) : null), [landing])
  const [previewing, setPreviewing] = useState(false)
  // After a failed image upload: what is uploaded so far, what is left, and
  // the design without the failed images, if the person chooses that.
  const [uploadState, setUploadState] = useState<{
    partial: CanonicalDocument
    failed: Array<PendingAsset & { reason: string }>
    withoutFailed: CanonicalDocument
  } | null>(null)
  // One key per create attempt, reused on retry so it never duplicates.
  const createKey = useRef<string | null>(null)

  const load = useCallback(async () => {
    setList({ status: 'loading' })
    const result = await listOwnedDesigns()

    if (result.ok) {
      setList({ status: 'ready', designs: result.data.designs })
    } else if (result.code !== 'account-changed') {
      setList({ status: 'failed', message: result.message })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, accountEpoch])

  async function create({
    fromLanding = false,
    withoutFailed = false,
  }: { fromLanding?: boolean; withoutFailed?: boolean } = {}) {
    if (!TEE.ok) {
      return
    }

    createKey.current ??= crypto.randomUUID()
    setCreating(true)
    setCreateError(null)

    let document = fromLanding && conversion?.fromLanding ? conversion.document : initialStudioDocument({ handoff: null }).document

    // Inline images from the landing design become real uploads first; the
    // server refuses a design that points at an image it never received.
    // A failure stops here so the person decides; a retry uploads only what
    // failed.
    if (fromLanding && withoutFailed && uploadState) {
      document = uploadState.withoutFailed
    } else if (fromLanding && conversion && conversion.pendingAssets.length > 0) {
      const uploads = await uploadPendingAssets({
        document: uploadState?.partial ?? document,
        pendingAssets: uploadState?.failed ?? conversion.pendingAssets,
      })

      if (uploads.failed.length > 0) {
        setUploadState({
          partial: uploads.partial,
          failed: uploads.failed,
          withoutFailed: uploads.document,
        })
        setCreating(false)
        return
      }

      document = uploads.document
    }

    const result = await createOwnedDesign({
      request: {
        mutationKey: createKey.current,
        title: fromLanding ? 'Landing tee' : 'Untitled tee',
        content: document,
      },
    })

    setCreating(false)

    if (!result.ok) {
      if (result.code === 'quota_exceeded') {
        // Retrying cannot help; the message says what to delete.
        createKey.current = null
        setCreateError(result.message)
      } else if (result.code !== 'account-changed') {
        setCreateError(
          `Your design was not created (${result.message}). Nothing was saved to the cloud; try again.`,
        )
      }
      return
    }

    createKey.current = null
    void trackAssumption({ name: 'design_created' })

    if (landing) {
      consumeLandingHandoff()
    }

    // A design brought from the landing already has its garment and colour.
    const step = landing ? 'design' : firstCreateStep({ pro: useStudioMode.getState().pro })
    void navigate({ to: '/create', search: { cloud: result.data.designId, step } })
  }

  /** A private copy of the example, the person's own to change. */
  async function openExample() {
    setCreating(true)
    setCreateError(null)
    const result = await createOwnedDesign({
      request: {
        mutationKey: crypto.randomUUID(),
        title: EXAMPLE_DESIGN_TITLE,
        content: createExampleDocument(),
      },
    })
    setCreating(false)

    if (result.ok) {
      void trackAssumption({ name: 'design_created' })
      void navigate({ to: '/create', search: { cloud: result.data.designId, step: 'design' } })
    } else if (result.code !== 'account-changed') {
      setCreateError(result.code === 'quota_exceeded' ? result.message : `The example could not open (${result.message}). Try again.`)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">My Studio</p>
          <h1 className="font-display text-4xl leading-tight">Your designs</h1>
          <p className="font-body text-sm text-flv-muted">
            Private to you. New designs save to your account as you work.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={creating || !TEE.ok}
            onClick={() => (conversion?.fromLanding ? setPreviewing(true) : void create())}
          >
            {creating ? 'Creating…' : conversion?.fromLanding ? 'Create from your landing design' : 'Create a T-shirt'}
          </button>
          <button
            type="button"
            className="min-h-9 font-body text-xs text-flv-muted underline underline-offset-2 hover:text-flv-accent disabled:opacity-50"
            disabled={creating || !TEE.ok}
            onClick={() => void openExample()}
          >
            Start from an example
          </button>
          {TEE.ok ? (
            <p className="font-body text-xs text-flv-muted">
              {TEE.manifest.regions.front.label}, back and both sleeves · crew neck, short sleeve
            </p>
          ) : null}
        </div>
      </header>

      {previewing && landing && conversion?.fromLanding ? (
        <ImportPreview
          before={landing.document}
          after={conversion.document}
          notes={conversion.notes}
          imageCount={conversion.pendingAssets.length}
          uploadFailures={uploadState?.failed.map((each) => each.reason) ?? []}
          busy={creating}
          onCreate={() => void create({ fromLanding: true })}
          onCreateWithoutFailed={() => void create({ fromLanding: true, withoutFailed: true })}
          onStartEmpty={() => void create()}
        />
      ) : null}

      <PublicName />

      <p role="status" aria-live="polite" className="min-h-5 font-body text-sm text-flv-accent">
        {createError}
      </p>

      {list.status === 'loading' ? (
        <p className="font-body text-sm text-flv-muted">Loading your designs…</p>
      ) : list.status === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="font-body text-sm text-flv-accent">
            Your designs could not load ({list.message}).
          </p>
          <button type="button" className={buttonClass} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : list.designs.length === 0 ? (
        <p className="font-body text-sm text-flv-muted">
          No designs yet. Create a T-shirt to start.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.designs.map((design) => (
            <li key={design.id} className="min-w-0">
              <DesignCard
                design={design}
                ownerId={ownerId ?? ''}
                onRenamed={(title) =>
                  setList((current) =>
                    current.status === 'ready'
                      ? {
                          status: 'ready',
                          designs: current.designs.map((each) =>
                            each.id === design.id ? { ...each, title } : each,
                          ),
                        }
                      : current,
                  )
                }
                onDeleted={() =>
                  setList((current) =>
                    current.status === 'ready'
                      ? { status: 'ready', designs: current.designs.filter((each) => each.id !== design.id) }
                      : current,
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
