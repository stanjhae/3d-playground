import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { GownCredit } from '../components/editor/GownCredit'
import { LookStage } from '../components/scene/LookStage'
import { getDesign, voteOnDesign } from '../lib/designs-api'
import { type Design } from '../lib/design-schema'
import { resolveFetchedLook } from '../lib/fetched-look'
import { HOUSE_COPY } from '../lib/house-copy'

export const Route = createFileRoute('/look/$lookId')({
  component: LookPage,
})

function LookPage() {
  const { lookId } = Route.useParams()
  const [look, setLook] = useState<Design | null>(null)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const [voteError, setVoteError] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const votingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    setStatus('loading')
    setCopyStatus('idle')
    setVoteError(null)

    void getDesign({ id: lookId })
      .then((design) => {
        if (cancelled) {
          return
        }

        const resolved = resolveFetchedLook({ failed: false, design })
        setLook(resolved.design)
        setStatus(resolved.status)

        if (resolved.design) {
          document.title = `${resolved.design.title} — Fashion Leader Vote`
        }
      })
      .catch(() => {
        if (!cancelled) {
          const resolved = resolveFetchedLook({ failed: true, design: null })
          setLook(resolved.design)
          setStatus(resolved.status)
        }
      })

    return () => {
      cancelled = true
      document.title = 'Fashion Leader Vote'
    }
  }, [lookId])

  async function handleVote() {
    if (!look || voting || votingRef.current) {
      return
    }

    votingRef.current = true
    setVoteError(null)
    setVoting(true)

    try {
      const result = await voteOnDesign({ id: look.id })
      setLook({ ...look, votes: result.votes })
    } catch {
      setVoteError(HOUSE_COPY.voteFailed)
    } finally {
      votingRef.current = false
      setVoting(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <section className="relative h-dvh overflow-hidden">
      {status === 'ready' && look ? (
        <LookStage
          garmentId={look.garmentId}
          overrides={look.overrides}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6">
          {status === 'loading' ? (
            <p className="text-sm text-ivory-muted">{HOUSE_COPY.lookLoading}</p>
          ) : null}
          {status === 'error' || status === 'missing' ? (
            <div className="flex max-w-md flex-col gap-4">
              <h1 className="font-display text-4xl text-ivory">
                {HOUSE_COPY.lookGone}
              </h1>
              <Link to="/vote" search={{}} className="text-brass hover:underline">
                Back to the board
              </Link>
            </div>
          ) : null}
        </div>
      )}
      {status === 'ready' && look ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-4 bg-gradient-to-t from-atelier via-atelier/70 to-transparent p-6 pt-20">
          <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
            Shared look
          </p>
          <h1 className="font-display text-4xl text-ivory md:text-5xl">
            {look.title}
          </h1>
          <p className="text-sm text-ivory-muted">
            By {look.author} · {look.votes}{' '}
            {look.votes === 1 ? 'vote' : 'votes'}
          </p>
          <GownCredit garmentId={look.garmentId} />
          {voteError ? (
            <p className="text-sm text-ivory-muted">{voteError}</p>
          ) : null}
          {copyStatus === 'error' ? (
            <p className="text-sm text-ivory-muted">{HOUSE_COPY.copyFailed}</p>
          ) : null}
          <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={voting}
              onClick={() => {
                void handleVote()
              }}
              className="min-h-11 border border-brass px-5 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase hover:bg-atelier disabled:opacity-50"
            >
              {voting ? 'Voting' : 'Vote this look'}
            </button>
            <Link
              to="/"
              search={{ design: look.id }}
              className="min-h-11 border border-atelier-line px-5 py-2 text-center font-display text-xs tracking-[0.18em] text-ivory uppercase hover:text-brass"
            >
              Remix in studio
            </Link>
            <button
              type="button"
              onClick={() => {
                void handleCopy()
              }}
              className="min-h-11 border border-atelier-line px-5 py-2 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass"
            >
              {copyStatus === 'copied' ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
