import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RequireSession } from '../components/auth/RequireSession'
import { DesignCard } from '../components/studio/DesignCard'
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
import { initialStudioDocument } from '../lib/studio-create'
import { resolveTemplate } from '../lib/template-manifest'

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
  'flv-cta inline-flex min-h-11 items-center justify-center px-5 font-body text-xs tracking-[0.1em] uppercase disabled:opacity-50'

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

  async function create() {
    if (!TEE.ok) {
      return
    }

    createKey.current ??= crypto.randomUUID()
    setCreating(true)
    setCreateError(null)

    const { document } = initialStudioDocument({ handoff: landing })
    const result = await createOwnedDesign({
      request: {
        mutationKey: createKey.current,
        title: landing ? 'Landing tee' : 'Untitled tee',
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

    if (landing) {
      consumeLandingHandoff()
    }

    void navigate({ to: '/create', search: { cloud: result.data.designId, step: 'design' } })
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
            onClick={() => void create()}
          >
            {creating ? 'Creating…' : landing ? 'Create from your landing design' : 'Create a T-shirt'}
          </button>
          {TEE.ok ? (
            <p className="font-body text-xs text-flv-muted">
              {TEE.manifest.regions.front.label}, back and both sleeves · crew neck, short sleeve
            </p>
          ) : null}
        </div>
      </header>

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
            <li key={design.id}>
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
