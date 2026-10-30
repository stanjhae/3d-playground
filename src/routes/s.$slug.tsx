import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { getPublicDesign } from '../lib/flp-api/client'
import type { PublicDesign } from '../lib/flp-api/publication'

/**
 * Public, read-only page for a published design (P04 #182). No sign-in.
 * Shows only what the owner published: title, display name and the views
 * of the published version. No editing, source or history.
 */

export const Route = createFileRoute('/s/$slug')({
  component: SharedDesign,
})

const VIEWS: Array<{ kind: keyof PublicDesign['renders']; label: string }> = [
  { kind: 'view_front', label: 'Front' },
  { kind: 'view_three_quarter', label: 'Three-quarter' },
  { kind: 'view_back', label: 'Back' },
]

function SharedDesign() {
  const { slug } = Route.useParams()
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; design: PublicDesign }
  >({ status: 'loading' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    void getPublicDesign({ slug }).then((result) => {
      if (cancelled) {
        return
      }

      setState(
        result.ok
          ? { status: 'ready', design: result.data }
          : { status: result.code === 'network' ? 'error' : 'missing' },
      )
    })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.status === 'loading') {
    return <p className="mx-auto max-w-4xl px-4 py-24 font-body text-sm text-flv-muted">Opening the design…</p>
  }

  if (state.status !== 'ready') {
    return (
      <section className="mx-auto max-w-xl px-4 py-24">
        <h1 className="font-display text-3xl">This design is not available</h1>
        <p className="mt-2 font-body text-sm text-flv-muted">
          {state.status === 'error'
            ? 'It could not load. Check your connection and try again.'
            : 'It may have been unpublished, or the link is wrong.'}
        </p>
      </section>
    )
  }

  const { design } = state

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Shared design</p>
          <h1 className="font-display text-4xl leading-tight">{design.title}</h1>
          <p className="font-body text-sm text-flv-muted">
            {design.displayName ? `By ${design.displayName} · ` : ''}version {design.seq} · published{' '}
            {new Date(design.publishedAt).toLocaleDateString()}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center border border-flv-line px-4 font-body text-xs tracking-[0.1em] uppercase hover:border-flv-accent hover:text-flv-accent"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true))
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {VIEWS.map((view) => (
          <li key={view.kind} className="flex flex-col gap-2">
            <img
              src={design.renders[view.kind]}
              alt={`${design.title}, ${view.label.toLowerCase()} view`}
              className="aspect-[3/4] w-full border border-flv-line bg-flv-paper object-contain"
            />
            <span className="font-body text-xs tracking-[0.08em] text-flv-muted uppercase">{view.label}</span>
          </li>
        ))}
      </ul>

      <p className="font-body text-xs text-flv-muted">
        A garment visualization on a fixed T-shirt template, not a fit or manufacturing preview.
      </p>
    </section>
  )
}
