import { useState } from 'react'

import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'

const BENEFITS = [
  FLV_COPY.waitlistBenefitPackages,
  FLV_COPY.waitlistBenefitNoPayment,
  FLV_COPY.waitlistBenefitNoSub,
  FLV_COPY.waitlistBenefitExpires,
] as const

export function LandingWaitlist() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>(
    'idle',
  )

  return (
    <section
      id="waitlist"
      className="flex flex-col gap-8 px-6 py-14 sm:px-10 lg:flex-row lg:items-stretch lg:justify-between"
    >
      <div className="flex max-w-xl flex-col justify-center gap-3">
        <p className="font-body text-xs tracking-[0.22em] text-flv-accent uppercase">
          👑 {FLV_COPY.waitlistTitle}
        </p>
        <h2 className="font-display text-3xl text-flv-ink sm:text-4xl">
          {FLV_COPY.waitlistOffer}
        </h2>
        <p className="font-body text-sm text-flv-muted">{FLV_COPY.waitlistLead}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {BENEFITS.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-2 font-body text-sm text-flv-ink"
            >
              <span className="mt-0.5 text-flv-accent" aria-hidden>
                ✓
              </span>
              <span className="tracking-[0.04em] uppercase">{benefit}</span>
            </li>
          ))}
        </ul>
        <p className="font-body text-xs text-flv-muted">
          {FLV_COPY.waitlistEmailOnly}
        </p>
      </div>
      <form
        className="flv-panel flex w-full max-w-md flex-col gap-4 p-6"
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
            placeholder="you@studio.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            className="min-h-12 rounded-full border border-flv-line bg-flv-paper px-4 font-body text-sm text-flv-ink"
          />
        </label>
        <button
          type="submit"
          disabled={status === 'joining'}
          className="flv-cta min-h-12 px-4 font-body text-xs tracking-[0.08em] uppercase disabled:opacity-50"
        >
          {status === 'joining'
            ? HOUSE_COPY.joining
            : `${FLV_COPY.getEarlyAccess} →`}
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
      <p className="flv-vertical-tag hidden self-end lg:block">
        {FLV_COPY.verticalFooterFashion} {FLV_COPY.verticalFooterTech}{' '}
        {FLV_COPY.verticalFooterPeople} {FLV_COPY.verticalFooterImpact}
      </p>
    </section>
  )
}
