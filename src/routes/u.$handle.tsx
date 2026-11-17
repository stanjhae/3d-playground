import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { FollowButton } from '../components/vote/FollowButton'
import { COMMUNITY } from '../lib/community'
import { getPublicProfile } from '../lib/flp-api/public-read'
import type { PublicProfile } from '../lib/flp-api/publication'
import { voteCountLabel } from '../lib/flp-api/votes'
import { getGarment } from '../lib/garments'
import { pageTitle } from '../lib/page-title'

/**
 * A designer's public profile: their live published designs and the votes
 * each has. It exists only while the designer has turned it on in My
 * Studio; otherwise the page reads as not available, like a missing one.
 */
export const Route = createFileRoute('/u/$handle')({
  component: ProfilePage,
})

type PageState = { status: 'loading' } | { status: 'missing' | 'failed' } | { status: 'ready'; profile: PublicProfile }

function ProfilePage() {
  const { handle } = Route.useParams()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    void getPublicProfile({ handle }).then((result) => {
      if (!cancelled) {
        setState(result.ok ? { status: 'ready', profile: result.data } : { status: result.code === 'not_found' ? 'missing' : 'failed' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [handle, attempt])

  const name = state.status === 'ready' ? (state.profile.displayName ?? `@${state.profile.handle}`) : null

  useEffect(() => {
    document.title = pageTitle({ label: name ?? (state.status === 'loading' ? null : 'Profile') })
  }, [name, state.status])

  if (state.status === 'loading') {
    return (
      <p role="status" className="mx-auto max-w-4xl px-4 py-24 font-body text-sm text-flv-muted">
        Opening the profile…
      </p>
    )
  }

  if (state.status !== 'ready') {
    return (
      <section className="mx-auto max-w-xl px-4 py-24">
        <h1 className="font-display text-3xl">
          {state.status === 'missing' ? 'This profile is not available' : 'This profile can’t load right now'}
        </h1>
        <p className="mt-2 font-body text-sm text-flv-muted">
          {state.status === 'missing'
            ? 'The link may be wrong, or the designer has made their profile private.'
            : 'The problem is on our side. Try again in a moment.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3 font-body text-sm">
          {state.status === 'failed' ? (
            <button type="button" className="underline" onClick={() => setAttempt((count) => count + 1)}>
              Try again
            </button>
          ) : null}
          <Link to="/ranking" className="underline">
            See the rankings
          </Link>
        </div>
      </section>
    )
  }

  const { profile } = state
  const total = profile.designs.reduce((sum, design) => sum + design.votes, 0)

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-1">
        <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Designer</p>
        <h1 className="font-display text-4xl [overflow-wrap:anywhere]">{name}</h1>
        <p className="font-body text-sm text-flv-muted">
          @{profile.handle} · {profile.designs.length} {profile.designs.length === 1 ? 'design' : 'designs'} published ·{' '}
          {voteCountLabel({ count: total })}
        </p>
        {COMMUNITY ? <FollowButton handle={profile.handle} /> : null}
      </header>

      {profile.designs.length === 0 ? (
        <p className="font-body text-sm text-flv-muted">Nothing published yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.designs.map((design, index) => (
            <li key={design.slug} className="flv-panel flex flex-col gap-3 p-4">
              <Link to="/s/$slug" params={{ slug: design.slug }} className="flex flex-col gap-3">
                <img
                  src={design.image}
                  alt={`${design.title}, front view`}
                  loading={index < 3 ? 'eager' : 'lazy'}
                  className="aspect-[3/4] w-full rounded-xl border border-flv-line bg-flv-soft object-contain"
                />
                <h2 className="font-display text-2xl text-flv-ink [overflow-wrap:anywhere]">{design.title}</h2>
                <p className="font-body text-sm text-flv-muted">{getGarment({ garmentId: design.garmentId }).label}</p>
              </Link>
              <p className="font-body text-sm text-flv-muted">{voteCountLabel({ count: design.votes })}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
