import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { cn } from '../../lib/cn'
import { followerLabel, getFollowState, setFollow } from '../../lib/community'
import type { FollowState } from '../../lib/flp-api/contract'

/** Follow a designer's public profile (community); their designs show under Following on /vote. */
export function FollowButton({ handle }: { handle: string }) {
  const status = useSessionStore((state) => state.status)
  const accountEpoch = useSessionStore((state) => state.accountEpoch)
  const [state, setState] = useState<FollowState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    let cancelled = false

    void getFollowState({ handle }).then((result) => {
      if (!cancelled && result.ok) setState(result.data)
    })

    return () => {
      cancelled = true
    }
  }, [handle, status, accountEpoch])

  if (!state) return null

  const count = (
    <span className="font-body text-sm text-flv-muted" data-testid="follower-count">
      {followerLabel({ count: state.followers })}
    </span>
  )

  if (status === 'signed-out') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/sign-in" search={{ returnTo: `/u/${handle}` }} className="font-body text-sm underline">
          Sign in to follow
        </Link>
        {count}
      </div>
    )
  }

  if (state.own || status !== 'signed-in') return count

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={state.following}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = await setFollow({ handle, follow: !state.following })
            setBusy(false)
            if (result.ok) setState(result.data)
            else if (result.code !== 'account-changed') setError(result.message)
          }}
          className={cn('inline-flex min-h-11 items-center border px-4 font-body text-xs tracking-[0.1em] uppercase disabled:opacity-60', {
            'border-flv-accent bg-flv-accent text-white': state.following,
            'border-flv-accent text-flv-accent hover:bg-flv-soft': !state.following,
          })}
        >
          {state.following ? 'Following' : 'Follow'}
        </button>
        {count}
      </div>
      <p role="status" className={error ? 'font-body text-xs text-flv-accent' : 'sr-only'}>
        {error ?? ''}
      </p>
    </div>
  )
}
