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
            <p className="font-body text-sm text-flv-muted">
              {HOUSE_COPY.lookLoading}
            </p>
          ) : null}
          {status === 'error' || status === 'missing' ? (
            <div className="flex max-w-md flex-col gap-4">
              <h1 className="font-display text-4xl text-flv-ink">
                {status === 'error'
                  ? HOUSE_COPY.lookFailed
                  : HOUSE_COPY.lookGone}
              </h1>
              <Link
                to="/vote"
                search={{}}
                className="font-body text-flv-accent hover:underline"
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
            <p className="font-display text-xs tracking-[0.22em] text-flv-accent uppercase">
              {HOUSE_COPY.sharedLook}
            </p>
            <h1 className="font-display text-3xl text-flv-ink sm:text-4xl md:text-5xl">
              {look.title}
            </h1>
            <p className="font-body text-base text-flv-ink">
              {lookRecipe({ design: look })}
            </p>
            {look.description ? (
              <p className="font-body text-sm text-flv-muted">
                {look.description}
              </p>
            ) : null}
            <p className="font-body text-sm text-flv-muted">
              {HOUSE_COPY.by} {look.author} · {look.votes}{' '}
              {look.votes === 1 ? HOUSE_COPY.voteOne : HOUSE_COPY.votes}
            </p>
            {look.tags && look.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {look.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-flv-line px-2 py-1 font-body text-xs tracking-[0.08em] text-flv-muted uppercase"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {look.angleStills && look.angleStills.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto">
                {look.angleStills.map((still, index) => (
                  <img
                    key={`${look.id}-angle-${index}`}
                    alt=""
                    src={still}
                    className="h-24 w-20 shrink-0 border border-flv-line object-cover"
                  />
                ))}
              </div>
            ) : null}
            <GownCredit garmentId={look.garmentId} />
            {voteError ? (
              <p className="font-body text-sm text-flv-muted">{voteError}</p>
            ) : null}
            {copyStatus === 'error' ? (
              <p className="font-body text-sm text-flv-muted">
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
                className="flv-cta min-h-11 min-w-[10rem] flex-1 px-5 py-2 font-body text-xs tracking-[0.08em] uppercase disabled:opacity-50"
              >
                {voting ? HOUSE_COPY.voting : HOUSE_COPY.voteThisLook}
              </button>
              <Link
                to="/create"
                search={{ design: look.id }}
                className="min-h-11 min-w-[10rem] flex-1 border border-flv-line px-5 py-2 text-center font-body text-xs tracking-[0.08em] text-flv-ink uppercase hover:text-flv-accent"
              >
                {HOUSE_COPY.remix}
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleCopy()
                }}
                className="min-h-11 min-w-[10rem] flex-1 border border-flv-line px-5 py-2 font-body text-xs tracking-[0.08em] text-flv-muted uppercase hover:text-flv-accent"
              >
                {copyStatus === 'copied'
                  ? HOUSE_COPY.linkCopied
                  : HOUSE_COPY.copyLink}
              </button>
              <Link
                to="/vote"
                search={{}}
                className="min-h-11 min-w-[10rem] flex-1 border border-flv-line px-5 py-2 text-center font-body text-xs tracking-[0.08em] text-flv-ink uppercase hover:text-flv-accent"
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
