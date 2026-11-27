import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import type { ComparisonPair } from '../../lib/flp-api/publication'
import { chooseComparison, getComparison } from '../../lib/flp-api/votes'
import { getGarment } from '../../lib/garments'
import { buttonClass } from '../ui/Button'

/**
 * Two designs, the ones this account has seen least. Choosing one records
 * the pick and loads the next pair.
 */
export function ComparePair() {
  const status = useSessionStore((state) => state.status)
  const [pair, setPair] = useState<ComparisonPair | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'failed'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'signed-in') {
      return
    }

    let cancelled = false

    void getComparison().then((result) => {
      if (cancelled) {
        return
      }

      if (!result.ok) {
        setState('failed')
        return
      }

      setPair(result.data.pair)
      setState(result.data.pair ? 'ready' : 'empty')
    })

    return () => {
      cancelled = true
    }
  }, [status])

  async function choose({ slug }: { slug: string }) {
    if (!pair || busy) {
      return
    }

    setBusy(true)
    setError(null)
    const result = await chooseComparison({ left: pair.left.slug, right: pair.right.slug, chosen: slug })
    setBusy(false)

    if (!result.ok) {
      setError(result.message)
      return
    }

    setPair(result.data.pair)
    setState(result.data.pair ? 'ready' : 'empty')
  }

  if (status === 'signed-out') {
    return (
      <p className="font-body text-sm text-flv-muted">
        <Link to="/sign-in" search={{ returnTo: '/vote?mode=compare' }} className="underline">
          Sign in
        </Link>{' '}
        to compare two designs.
      </p>
    )
  }

  if (status === 'loading' || state === 'loading') {
    return <p className="font-body text-sm text-flv-muted">Finding two designs…</p>
  }

  if (state === 'failed') {
    return <p className="font-body text-sm text-flv-muted">Comparisons aren’t available right now.</p>
  }

  if (state === 'empty' || !pair) {
    return <p className="font-body text-sm text-flv-muted">There aren’t two designs to compare yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl font-body text-sm text-flv-muted">
        Pick the one you would rather wear. Designs you have seen less often come up first, and the ranking uses these
        picks as well as the vote count.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[pair.left, pair.right].map((design) => (
          <article key={design.slug} className="flv-panel flex flex-col gap-3 p-4">
            <img src={design.image} alt={`${design.title}, front view`} className="aspect-[3/4] w-full rounded-xl border border-flv-line object-contain" />
            <h2 className="font-display text-2xl text-flv-ink [overflow-wrap:anywhere]">{design.title}</h2>
            <p className="font-body text-sm text-flv-muted">{getGarment({ garmentId: design.garmentId }).label}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void choose({ slug: design.slug })}
              className={buttonClass()}
            >
              This one
            </button>
          </article>
        ))}
      </div>
      <p role="status" className={error ? 'font-body text-xs text-flv-accent' : 'sr-only'}>
        {error ?? ''}
      </p>
    </div>
  )
}
