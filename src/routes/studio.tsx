import { firstCreateStep, useStudioMode } from '../lib/studio-mode'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RequireSession } from '../components/auth/RequireSession'
import { DeleteAccount } from '../components/studio/DeleteAccount'
import { DesignCard } from '../components/studio/DesignCard'
import { ImportPreview } from '../components/studio/ImportPreview'
import { PublicName } from '../components/studio/PublicName'
import { useSessionStore, waitForSession } from '../lib/auth/session-store'
import { authConfigured, getSupabaseClient } from '../lib/auth/supabase-client'
import { createEmptyCanonicalDocument } from '../lib/canonical-document'
import {
  type DesignSummary,
  createOwnedDesign,
  getOwnedDesign,
  listOwnedDesigns,
} from '../lib/flp-api/client'
import {
  STUDIO_SORTS,
  type StudioSort,
  copyTitle,
  documentGarment,
  untitledTitle,
  readStudioSort,
  visibleDesigns,
  writeStudioSort,
} from '../lib/my-studio-list'
import { failureSentence } from '../lib/flp-api/plain-messages'
import { consumeLandingHandoff, peekLandingHandoff } from '../lib/landing-handoff'
import type { CanonicalDocument } from '../lib/canonical-document'
import type { PendingAsset } from '../lib/legacy-import'
import { uploadPendingAssets } from '../lib/legacy-assets'
import { initialStudioDocument } from '../lib/studio-create'
import { EXAMPLE_DESIGN_TITLE, createExampleDocument } from '../lib/example-design'
import { getGarment, listRailGarments } from '../lib/garments'
import { resolveTemplate, templateForGarment } from '../lib/template-manifest'
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

/** "a coat", "an overall dress". */
function withArticle({ noun }: { noun: string }) {
  return `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`
}

/** Garments a new design can start from: every one with a template. */
function designableGarments() {
  return listRailGarments().filter((garment) => templateForGarment({ garmentId: garment.id }))
}

function sortStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

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
  // Every garment with a template can be designed; the tee stays the default.
  const [newGarment, setNewGarment] = useState<string>('tee')
  const newTemplate = templateForGarment({ garmentId: newGarment })
  const [createError, setCreateError] = useState<string | null>(null)
  const [listNotice, setListNotice] = useState('')
  const designsHeading = useRef<HTMLHeadingElement | null>(null)
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
  // The same for the example and for each copy: a retry after a lost
  // response returns the design already made. The server checks the content
  // with the key, so the content is kept with it.
  const exampleAttempt = useRef<{ key: string; content: CanonicalDocument } | null>(null)
  const copyAttempts = useRef(new Map<string, { key: string; content: CanonicalDocument }>())
  const [copying, setCopying] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<StudioSort>(() => readStudioSort({ storage: sortStorage() }))

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

    let document =
      fromLanding && conversion?.fromLanding
        ? conversion.document
        : newGarment !== 'tee' && newTemplate
          ? createEmptyCanonicalDocument({ templateId: newTemplate.id })
          : initialStudioDocument({ handoff: null }).document

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
        title: fromLanding ? 'Landing tee' : untitledTitle({ garmentId: newGarment }),
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
          `${failureSentence({ lead: 'Your design was not created', reason: result.message })} Nothing was saved to the cloud; try again.`,
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
    exampleAttempt.current ??= { key: crypto.randomUUID(), content: createExampleDocument() }
    const result = await createOwnedDesign({
      request: {
        mutationKey: exampleAttempt.current.key,
        title: EXAMPLE_DESIGN_TITLE,
        content: exampleAttempt.current.content,
      },
    })
    setCreating(false)

    // Done, or a refusal a retry cannot change: the next open is a new copy.
    if (result.ok || result.code === 'quota_exceeded') {
      exampleAttempt.current = null
    }

    if (result.ok) {
      void trackAssumption({ name: 'design_created' })
      void navigate({ to: '/create', search: { cloud: result.data.designId, step: 'design' } })
    } else if (result.code !== 'account-changed') {
      setCreateError(result.code === 'quota_exceeded' ? result.message : failureSentence({ lead: 'The example could not open', reason: result.message }))
    }
  }

  /** A private copy of one design's latest version, added to the list. */
  async function duplicate(design: DesignSummary) {
    setCopying(design.id)
    setCreateError(null)
    let attempt = copyAttempts.current.get(design.id)

    if (!attempt) {
      const opened = await getOwnedDesign({ designId: design.id })

      if (!opened.ok || !opened.data.head) {
        setCopying(null)
        if (opened.ok || opened.code !== 'account-changed') {
          setCreateError(
            failureSentence({ lead: `${design.title} was not copied`, reason: opened.ok ? 'It has nothing saved yet.' : opened.message }),
          )
        }
        return
      }

      attempt = { key: crypto.randomUUID(), content: opened.data.head.content }
      copyAttempts.current.set(design.id, attempt)
    }

    const title = copyTitle({ title: design.title, garmentId: documentGarment({ document: attempt.content }) })
    const result = await createOwnedDesign({ request: { mutationKey: attempt.key, title, content: attempt.content } })
    setCopying(null)

    if (result.ok || result.code === 'quota_exceeded') {
      copyAttempts.current.delete(design.id)
    }

    if (!result.ok) {
      if (result.code !== 'account-changed') {
        setCreateError(
          result.code === 'quota_exceeded'
            ? result.message
            : `${failureSentence({ lead: `${design.title} was not copied`, reason: result.message })} Try again.`,
        )
      }
      return
    }

    void trackAssumption({ name: 'design_created' })
    const copy: DesignSummary = {
      id: result.data.designId,
      title,
      visibility: 'private',
      headSeq: result.data.seq,
      updatedAt: result.data.createdAt,
    }
    setList((current) =>
      current.status === 'ready' && !current.designs.some((each) => each.id === copy.id)
        ? { status: 'ready', designs: [copy, ...current.designs] }
        : current,
    )
    setListNotice(`Copied as ${title}.`)
  }

  const shown = list.status === 'ready' ? visibleDesigns({ designs: list.designs, query, sort }) : []

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs font-medium tracking-[0.08em] text-flv-accent uppercase">My Studio</p>
          <h1 ref={designsHeading} tabIndex={-1} data-focus-target className="font-display text-4xl leading-none uppercase">
            Your designs
          </h1>
          <p className="font-body text-sm text-flv-muted">
            Private to you. New designs save to your account as you work.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {conversion?.fromLanding ? null : (
            <label className="flex items-center gap-2 font-body text-sm text-flv-muted">
              Garment
              <select
                value={newGarment}
                onChange={(event) => setNewGarment(event.target.value)}
                className="min-h-9 rounded-full border border-flv-line bg-flv-paper px-3 text-flv-ink"
              >
                {designableGarments().map((garment) => (
                  <option key={garment.id} value={garment.id}>
                    {garment.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={creating || (conversion?.fromLanding ? !TEE.ok : !newTemplate)}
            onClick={() => (conversion?.fromLanding ? setPreviewing(true) : void create())}
          >
            {creating
              ? 'Creating…'
              : conversion?.fromLanding
                ? 'Create from your landing design'
                : newGarment === 'tee'
                  ? 'Create a T-shirt'
                  : `Create ${withArticle({ noun: getGarment({ garmentId: newGarment }).label.toLowerCase() })}`}
          </button>
          <button
            type="button"
            className="min-h-9 font-body text-sm text-flv-muted underline underline-offset-2 hover:text-flv-ink disabled:opacity-50"
            disabled={creating || !TEE.ok}
            onClick={() => void openExample()}
          >
            Start from an example
          </button>
          {newTemplate ? (
            <p className="font-body text-xs text-flv-muted">
              Prints on: {Object.values(newTemplate.regions).map((region) => region.label).join(', ')}
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

      <p role="status" className="sr-only">
        {listNotice}
      </p>

      <p role="status" aria-live="polite" className="min-h-5 font-body text-sm text-flv-accent">
        {createError}
      </p>

      {list.status === 'loading' ? (
        <p className="font-body text-sm text-flv-muted">Loading your designs…</p>
      ) : list.status === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="font-body text-sm text-flv-accent">
            {failureSentence({ lead: 'Your designs could not load', reason: list.message })}
          </p>
          <button type="button" className={buttonClass} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : list.designs.length === 0 ? (
        <p className="flv-panel p-8 text-center font-body text-sm text-flv-muted">
          No designs yet. Create a T-shirt to start.
        </p>
      ) : (
        <>
        <div role="search" aria-label="Find a design" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
            <label htmlFor="studio-search" className="font-body text-xs text-flv-muted">
              Search by name
            </label>
            <input
              id="studio-search"
              type="search"
              value={query}
              maxLength={80}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-flv-line bg-white px-3 font-body text-base text-flv-ink sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="studio-sort" className="font-body text-xs text-flv-muted">
              Sort by
            </label>
            <select
              id="studio-sort"
              value={sort}
              onChange={(event) => {
                const next = event.target.value as StudioSort
                setSort(next)
                writeStudioSort({ storage: sortStorage(), sort: next })
              }}
              className="min-h-11 rounded-lg border border-flv-line bg-white px-3 font-body text-base text-flv-ink sm:text-sm"
            >
              {STUDIO_SORTS.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.label}
                </option>
              ))}
            </select>
          </div>
          <p aria-live="polite" className="min-h-11 content-center font-body text-xs text-flv-muted">
            {query.trim() ? `${shown.length} of ${list.designs.length} designs` : `${list.designs.length} ${list.designs.length === 1 ? 'design' : 'designs'}`}
          </p>
        </div>
        {shown.length === 0 ? (
          <div className="flv-panel flex flex-col items-center gap-3 p-8 text-center font-body text-sm text-flv-muted">
            <p className="[overflow-wrap:anywhere]">No designs match “{query.trim()}”.</p>
            <button type="button" className="min-h-9 underline underline-offset-2 hover:text-flv-ink" onClick={() => setQuery('')}>
              Clear the search
            </button>
          </div>
        ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((design) => (
            <li key={design.id} className="min-w-0">
              <DesignCard
                design={design}
                ownerId={ownerId ?? ''}
                duplicating={copying === design.id}
                onDuplicate={() => void duplicate(design)}
                onRenamed={(title) => {
                  setListNotice(`Renamed to ${title}.`)
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
                }}
                onDeleted={() => {
                  setListNotice(`Deleted ${design.title}.`)
                  setList((current) =>
                    current.status === 'ready'
                      ? { status: 'ready', designs: current.designs.filter((each) => each.id !== design.id) }
                      : current,
                  )
                  // The card and everything in it are gone.
                  designsHeading.current?.focus()
                }}
              />
            </li>
          ))}
        </ul>
        )}
        </>
      )}

      {/* The list shows at most 100, so a full list doesn't give a count. */}
      <DeleteAccount
        designCount={list.status === 'ready' && list.designs.length < 100 ? list.designs.length : null}
      />
    </section>
  )
}
