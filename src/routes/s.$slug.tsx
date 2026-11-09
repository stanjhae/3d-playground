import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { reportDesignHref } from '../lib/alpha-contact'
import { useCopyStatus } from '../lib/copy-text'
import { HOUSE_COPY } from '../lib/house-copy'
import { pageTitle } from '../lib/page-title'
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

const linkClass =
  'inline-flex min-h-11 items-center justify-center border border-flv-line px-4 font-body text-xs tracking-[0.1em] uppercase hover:border-flv-accent hover:text-flv-accent'

const FAILURES = {
  missing: {
    heading: 'This design is not available',
    detail: 'It may have been unpublished, or the link is wrong.',
  },
  outage: {
    heading: 'This design can’t load right now',
    detail: 'The problem is on our side, and it doesn’t mean the design was taken down. Try again in a moment.',
  },
  offline: {
    heading: 'This design can’t load right now',
    detail: 'It could not load. Check your connection and try again.',
  },
} as const

const FAILURE_BY_CODE = { not_found: 'missing', unavailable: 'outage', network: 'offline' } as const

type PageState =
  | { status: 'loading' }
  | { status: keyof typeof FAILURES }
  | { status: 'ready'; design: PublicDesign }

function MakeYourOwn() {
  return (
    <Link to="/create" search={{}} className={linkClass}>
      Make your own
    </Link>
  )
}

function SharedDesign() {
  const { slug } = Route.useParams()
  const [state, setState] = useState<PageState>(() => {
    // The share page embeds the payload in the HTML, so the first render
    // already has the views and the browser fetches the front at once.
    const embedded = takeEmbeddedPublicDesign({ slug })
    return embedded ? { status: 'ready', design: embedded } : { status: 'loading' }
  })
  const [attempt, setAttempt] = useState(0)
  const { status: copyStatus, copy } = useCopyStatus()
  const heading = useRef<HTMLHeadingElement | null>(null)

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

      setState(result.ok ? { status: 'ready', design: result.data } : { status: FAILURE_BY_CODE[result.code] })
    })

    return () => {
      cancelled = true
    }
  }, [slug, attempt])

  // Try again goes away with the screen it was on: land on the new heading.
  useEffect(() => {
    if (attempt > 0 && state.status !== 'loading') {
      heading.current?.focus()
    }
  }, [attempt, state.status])

  // Named after the design, once it is known which one this is.
  const designTitle = state.status === 'ready' ? state.design.title : null
  const failureHeading = state.status === 'ready' || state.status === 'loading' ? null : FAILURES[state.status].heading

  useEffect(() => {
    if (designTitle || failureHeading) {
      document.title = pageTitle({ label: designTitle ?? failureHeading })
    }
  }, [designTitle, failureHeading])

  // The server's pre-rendered views cover the app until this page has
  // rendered (#182); take them away once there is something to show.
  useEffect(() => {
    if (state.status !== 'loading') {
      document.getElementById(STATIC_SHARE_ELEMENT_ID)?.remove()
    }
  }, [state.status])

  if (state.status === 'loading') {
    return (
      <p role="status" className="mx-auto max-w-4xl px-4 py-24 font-body text-sm text-flv-muted">
        Opening the design…
      </p>
    )
  }

  if (state.status !== 'ready') {
    const failure = FAILURES[state.status]

    return (
      <section className="mx-auto max-w-xl px-4 py-24">
        <h1 ref={heading} tabIndex={-1} data-focus-target className="font-display text-3xl">
          {failure.heading}
        </h1>
        <p className="mt-2 font-body text-sm text-flv-muted">{failure.detail}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {state.status === 'missing' ? null : (
            <button type="button" className={linkClass} onClick={() => setAttempt((count) => count + 1)}>
              {HOUSE_COPY.tryAgain}
            </button>
          )}
          <MakeYourOwn />
        </div>
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
          <h1 ref={heading} tabIndex={-1} data-focus-target className="font-display text-4xl leading-tight [overflow-wrap:anywhere]">
            {design.title}
          </h1>
          <p className="font-body text-sm text-flv-muted">
            {design.displayName ? `By ${design.displayName} · ` : ''}version {design.seq} · published{' '}
            {new Date(design.publishedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex flex-wrap gap-3">
            <button type="button" className={linkClass} onClick={() => void copy(window.location.href)}>
              {copyStatus === 'copied' ? HOUSE_COPY.linkCopied : HOUSE_COPY.copyLink}
            </button>
            <MakeYourOwn />
          </div>
          {/* The button's label says "copied"; only a refusal needs words on screen. */}
          <p role="status" className={copyStatus === 'failed' ? 'font-body text-xs text-flv-accent' : 'sr-only'}>
            {copyStatus === 'failed' ? HOUSE_COPY.copyFailed : copyStatus === 'copied' ? HOUSE_COPY.linkCopied : ''}
          </p>
        </div>
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
