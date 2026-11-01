import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { reportDesignHref } from '../lib/alpha-contact'
import { PUBLIC_PREVIEW_DISCLAIMER } from '../lib/og-card'
import { getPublicDesign } from '../lib/flp-api/public-read'
import type { PublicDesign } from '../lib/flp-api/publication'
import { STATIC_SHARE_ELEMENT_ID, takeEmbeddedPublicDesign } from '../lib/public-embed'

/**
 * Public, read-only page for a published design (P04 #182). No sign-in.
 * Shows only what the owner published: title, display name and the views
 * of the published version. No editing, source or history.
 */

export const Route = createFileRoute('/s/$slug')({
  component: SharedDesign,
})

type View = { kind: keyof PublicDesign['renders']; label: string; alt: string }

const VIEWS: View[] = [
  { kind: 'view_front', label: 'Front', alt: 'front view' },
  { kind: 'view_three_quarter', label: 'Three-quarter', alt: 'three-quarter view' },
  { kind: 'view_back', label: 'Back', alt: 'back view' },
]

/** Named from the wearer's side: render `left` is the wearer's right (#179). */
const SLEEVE_VIEWS: View[] = [
  { kind: 'view_left', label: "Wearer's right", alt: "wearer's right sleeve" },
  { kind: 'view_right', label: "Wearer's left", alt: "wearer's left sleeve" },
]

/** Must match `SLEEVE_GRID_CLASS` in `flp-api/share-page.ts`. */
const SLEEVE_GRID_CLASS = 'grid grid-cols-2 gap-4 sm:mx-auto sm:w-2/3'

function ViewTile({ view, src, title, lazy = false }: { view: View; src: string; title: string; lazy?: boolean }) {
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <img
        src={src}
        // Sleeves sit below the fold: lazy, so they never slow the front view.
        loading={lazy ? 'lazy' : undefined}
        alt={`${title}, ${view.alt}`}
        className="aspect-[3/4] w-full border border-flv-line bg-flv-paper object-contain"
      />
      <span className="font-body text-xs tracking-[0.08em] text-flv-muted uppercase">{view.label}</span>
    </li>
  )
}

function SharedDesign() {
  const { slug } = Route.useParams()
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; design: PublicDesign }
  >(() => {
    // The share page embeds the payload in the HTML, so the first render
    // already has the views and the browser fetches the front at once.
    const embedded = takeEmbeddedPublicDesign({ slug })
    return embedded ? { status: 'ready', design: embedded } : { status: 'loading' }
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (state.status === 'ready' && state.design.slug === slug) {
      return
    }

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

  // The server's pre-rendered views cover the app until this page has
  // rendered (#182); take them away once there is something to show.
  useEffect(() => {
    if (state.status !== 'loading') {
      document.getElementById(STATIC_SHARE_ELEMENT_ID)?.remove()
    }
  }, [state.status])

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
  const reportHref = reportDesignHref({ slug })
  const sleeves = SLEEVE_VIEWS.flatMap((view) => {
    const src = design.renders[view.kind]
    return src ? [{ view, src }] : []
  })

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Shared design</p>
          <h1 className="font-display text-4xl leading-tight [overflow-wrap:anywhere]">{design.title}</h1>
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
          <ViewTile key={view.kind} view={view} src={design.renders[view.kind]!} title={design.title} />
        ))}
      </ul>

      {/* Versions published before the sleeve views have none (#179). */}
      {sleeves.length > 0 ? (
        <ul className={SLEEVE_GRID_CLASS}>
          {sleeves.map(({ view, src }) => (
            <ViewTile key={view.kind} view={view} src={src} title={design.title} lazy />
          ))}
        </ul>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 font-body text-xs text-flv-muted">
        <p>{PUBLIC_PREVIEW_DISCLAIMER} Shown on a fixed T-shirt template.</p>
        <p className="flex gap-4">
          {reportHref ? (
            <a className="underline hover:text-flv-accent" href={reportHref}>
              Report this design
            </a>
          ) : null}
          <Link to="/privacy" className="underline hover:text-flv-accent">
            Privacy
          </Link>
        </p>
      </footer>
    </section>
  )
}
