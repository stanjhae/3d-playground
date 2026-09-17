import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { LookCard } from '../components/vote/LookCard'
import { trackAssumption } from '../lib/assumption-events'
import { listDesigns, voteOnDesign } from '../lib/designs-api'
import type { Design } from '../lib/design-schema'
import { HOUSE_COPY } from '../lib/house-copy'
import { pickSoonLooks } from '../lib/look-recipe'

export const Route = createFileRoute('/soon')({
  component: SoonPage,
})

function SoonPage() {
  const [looks, setLooks] = useState<Design[]>([])
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>(
    'idle',
  )

  useEffect(() => {
    void trackAssumption({ name: 'viewed_demo' })
    void listDesigns()
      .then((designs) => {
        setLooks(pickSoonLooks({ designs }))
      })
      .catch(() => {
        setLooks([])
      })
  }, [])

  return (
    <section className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 pt-24 pb-16">
      <header className="flex flex-col gap-4">
        <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
          Launch soon
        </p>
        <h1 className="font-display text-4xl text-ivory sm:text-6xl">
          Fashion Leader Vote
        </h1>
        <p className="max-w-xl text-ivory-muted">{HOUSE_COPY.soonLead}</p>
      </header>
      <ul className="grid gap-4 md:grid-cols-3">
        {looks.map((look) => (
          <li key={look.id}>
            <LookCard
              design={look}
              onVote={({ id }) => {
                void voteOnDesign({ id }).then(() => {
                  void trackAssumption({ name: 'voted' })
                })
              }}
            />
          </li>
        ))}
      </ul>
      <form
        className="flex max-w-xl flex-col gap-3 border border-atelier-line p-4"
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
          <span className="font-display text-xs tracking-[0.22em] text-brass uppercase">
            {HOUSE_COPY.join}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            className="min-h-11 border border-atelier-line bg-atelier px-3 text-ivory"
          />
        </label>
        <button
          type="submit"
          disabled={status === 'joining'}
          className="min-h-11 border border-brass px-4 font-display text-xs tracking-[0.18em] text-brass uppercase disabled:opacity-50"
        >
          {status === 'joining' ? HOUSE_COPY.joining : HOUSE_COPY.join}
        </button>
        {status === 'joined' ? (
          <p className="text-sm text-ivory">{HOUSE_COPY.joined}</p>
        ) : null}
        {status === 'error' ? (
          <p className="text-sm text-ivory-muted">{HOUSE_COPY.waitlistFailed}</p>
        ) : null}
      </form>
    </section>
  )
}
