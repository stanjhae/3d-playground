import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { GownCredit } from '../components/editor/GownCredit'
import { LookStage } from '../components/scene/LookStage'
import { documentFromDesign } from '../lib/design-document'
import { getDesign, voteOnDesign } from '../lib/designs-api'
import { type Design } from '../lib/design-schema'
import { useEditorStore } from '../lib/editor-store'
import { resolveFetchedLook } from '../lib/fetched-look'
import { HOUSE_COPY } from '../lib/house-copy'
import { lookRecipe } from '../lib/look-recipe'
import { lookSheetBodyClass, lookSheetFrameClass } from '../lib/studio-chrome'

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
          useEditorStore.getState().rememberEnteredLook({
            title: resolved.design.title,
            document: documentFromDesign({ design: resolved.design }),
            still: resolved.design.thumbnailDataUrl,
            lookId: resolved.design.id,
          })
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
          artMap={look.artMap}
          structural={look.structural}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6">
          {status === 'loading' ? (
            <p className="font-body text-sm text-ivory-muted">
              {HOUSE_COPY.lookLoading}
            </p>
          ) : null}
          {status === 'error' || status === 'missing' ? (
            <div className="flex max-w-md flex-col gap-4">
              <h1 className="font-display text-4xl text-ivory">
                {status === 'error'
                  ? HOUSE_COPY.lookFailed
                  : HOUSE_COPY.lookGone}
              </h1>
              <Link
                to="/vote"
                search={{}}
                className="font-body text-brass hover:underline"
              >
                {HOUSE_COPY.backToBoard}
              </Link>
            </div>
          ) : null}
        </div>
      )}
      {status === 'ready' && look ? (
        <div className={lookSheetFrameClass()}>
          <div className={lookSheetBodyClass()}>
            <p className="font-display text-xs tracking-[0.22em] text-brass uppercase">
              {HOUSE_COPY.sharedLook}
            </p>
            <h1 className="font-display text-3xl text-ivory sm:text-4xl md:text-5xl">
              {look.title}
            </h1>
            <p className="font-body text-base text-ivory">
              {lookRecipe({ design: look })}
            </p>
            <p className="font-body text-sm text-ivory-muted">
              {HOUSE_COPY.by} {look.author} · {look.votes}{' '}
              {look.votes === 1 ? HOUSE_COPY.voteOne : HOUSE_COPY.votes}
            </p>
            <GownCredit garmentId={look.garmentId} />
            {voteError ? (
              <p className="font-body text-sm text-ivory-muted">{voteError}</p>
            ) : null}
            {copyStatus === 'error' ? (
              <p className="font-body text-sm text-ivory-muted">
                {HOUSE_COPY.copyFailed}
              </p>
            ) : null}
            <div className="flex flex-row flex-wrap gap-3">
              <button
                type="button"
                disabled={voting}
                onClick={() => {
                  void handleVote()
                }}
                className="min-h-11 min-w-[10rem] flex-1 border border-brass px-5 py-2 font-body text-xs tracking-[0.08em] text-brass uppercase hover:bg-atelier disabled:opacity-50"
              >
                {voting ? HOUSE_COPY.voting : HOUSE_COPY.voteThisLook}
              </button>
              <Link
                to="/"
                search={{ design: look.id }}
                className="min-h-11 min-w-[10rem] flex-1 border border-atelier-line px-5 py-2 text-center font-body text-xs tracking-[0.08em] text-ivory uppercase hover:text-brass"
              >
                {HOUSE_COPY.remix}
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleCopy()
                }}
                className="min-h-11 min-w-[10rem] flex-1 border border-atelier-line px-5 py-2 font-body text-xs tracking-[0.08em] text-ivory-muted uppercase hover:text-brass"
              >
                {copyStatus === 'copied'
                  ? HOUSE_COPY.linkCopied
                  : HOUSE_COPY.copyLink}
              </button>
              <Link
                to="/vote"
                search={{}}
                className="min-h-11 min-w-[10rem] flex-1 border border-atelier-line px-5 py-2 text-center font-body text-xs tracking-[0.08em] text-ivory uppercase hover:text-brass"
              >
                {HOUSE_COPY.backToBoard}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
