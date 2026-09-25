import { useState } from 'react'

import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'

export function LandingWaitlist() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>(
    'idle',
  )

  return (
    <section
      id="waitlist"
      className="flex flex-col gap-6 px-6 py-14 sm:px-10"
    >
      <div className="flex max-w-xl flex-col gap-2">
        <h2 className="font-display text-3xl text-flv-ink">
          {FLV_COPY.waitlistTitle}
        </h2>
        <p className="font-body text-sm text-flv-muted">
          {FLV_COPY.waitlistLead}
        </p>
      </div>
      <form
        className="flex max-w-xl flex-col gap-3 border border-flv-line p-4"
        onSubmit={(event) => {
          event.preventDefault()
          setStatus('joining')
          void fetch('/api/waitlist', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email }),
          })
            .then((response) => {
              setStatus(response.ok ? 'joined' : 'error')
            })
            .catch(() => {
              setStatus('error')
            })
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="font-display text-xs tracking-[0.22em] text-flv-accent uppercase">
            {HOUSE_COPY.join}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            className="min-h-11 border border-flv-line bg-flv-paper px-3 font-body text-sm text-flv-ink"
          />
        </label>
        <button
          type="submit"
          disabled={status === 'joining'}
          className="flv-cta min-h-11 px-4 font-body text-xs tracking-[0.08em] uppercase disabled:opacity-50"
        >
          {status === 'joining' ? HOUSE_COPY.joining : FLV_COPY.joinWaitlist}
        </button>
        {status === 'joined' ? (
          <p className="font-body text-sm text-flv-ink">{HOUSE_COPY.joined}</p>
        ) : null}
        {status === 'error' ? (
          <p className="font-body text-sm text-flv-muted">
            {HOUSE_COPY.waitlistFailed}
          </p>
        ) : null}
      </form>
    </section>
  )
}
