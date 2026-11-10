import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useMatch,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AccountControl } from '../components/auth/AccountControl'
import { SiteFooter } from '../components/site/SiteFooter'
import { SiteMenu } from '../components/site/SiteMenu'
import { buttonClass } from '../components/ui/Button'
import { CONCEPT_FEATURES } from '../lib/concept-flags'
import { onAccountChange, startSession, useSessionStore } from '../lib/auth/session-store'
import { AUTH_REQUIRED, authConfigured, getSupabaseClient } from '../lib/auth/supabase-client'
import { cn } from '../lib/cn'
import { useEditorStore } from '../lib/editor-store'
import { listDesigns } from '../lib/designs-api'
import { listSnapshots } from '../lib/design-snapshots'
import { FLV_COPY } from '../lib/flv-copy'
import { ownsPageTitle, pageTitle, routeLabel } from '../lib/page-title'
import { HOUSE_LOOK_FALLBACK_ID, lookIdFromPathname } from '../lib/paths'
import { rankDesigns } from '../lib/rank-designs'

export const Route = createRootRoute({
  component: RootShell,
})

let lastSignedInUserId: string | null = null

// A different account must never see the previous account's open design.
// Expiry (account → null) keeps it in memory for same-account re-sign-in.
onAccountChange((next) => {
  if (next && lastSignedInUserId && next.userId !== lastSignedInUserId) {
    useEditorStore.getState().reset()
  }

  // Snapshots are kept per account (#147): show this account's, or the
  // guest's after signing out.
  useEditorStore.setState({ snapshots: listSnapshots({ ownerId: next?.userId ?? null }) })

  if (next) {
    lastSignedInUserId = next.userId
  }
})

const MARKETING_LINKS = [
  { href: '#product', label: FLV_COPY.navProduct },
  { href: '#flow', label: FLV_COPY.navHowItWorks },
  ...(CONCEPT_FEATURES ? [{ href: '#community', label: FLV_COPY.navCommunity }] : []),
  { href: '#waitlist', label: FLV_COPY.navAbout },
] as const

/**
 * The studio fills the window, and a shared design carries its own footer
 * with these links.
 */
function showsSiteFooter({ pathname }: { pathname: string }) {
  return pathname !== '/create' && !pathname.startsWith('/s/')
}

/** Back to your designs when signed in; otherwise a way to sign in. */
function LandingAccountLink({ className }: { className: string }) {
  const signedIn = useSessionStore((state) => state.status === 'signed-in')

  if (signedIn) {
    return (
      <Link to="/studio" className={className}>
        {FLV_COPY.myStudio}
      </Link>
    )
  }

  return authConfigured() ? (
    <Link to="/sign-in" search={{ returnTo: '/studio' }} className={className}>
      {FLV_COPY.login}
    </Link>
  ) : null
}

const MENU_LINK_CLASS = 'flex min-h-11 items-center rounded-lg px-3 text-flv-ink hover:bg-flv-soft'

function RootShell() {
  const lookMatch = useMatch({
    from: '/look/$lookId',
    shouldThrow: false,
  })
  const location = useLocation()
  const [leaderId, setLeaderId] = useState<string | null>(null)
  const lookId =
    lookMatch?.params.lookId ??
    lookIdFromPathname({ pathname: location.pathname }) ??
    leaderId
  const isLanding = location.pathname === '/'
  const main = useRef<HTMLElement | null>(null)
  // The page actually on screen, unlike `location`, which moves first.
  const shownPath = useRouterState({ select: (state) => state.resolvedLocation?.pathname })
  const previousPath = useRef(shownPath)

  useEffect(() => {
    if (shownPath && !ownsPageTitle({ pathname: shownPath })) {
      document.title = pageTitle({ label: routeLabel({ pathname: shownPath }) })
    }

    const firstPage = previousPath.current === undefined
    const changed = previousPath.current !== shownPath
    previousPath.current = shownPath

    if (firstPage || !changed) {
      return
    }

    // A new page starts reading at its content, unless it already chose
    // where to put focus, as sign-in does with its first field.
    const active = document.activeElement

    if (!main.current?.contains(active) || active === main.current) {
      main.current?.focus({ preventScroll: true })
    }
  }, [shownPath])

  useEffect(() => {
    void startSession({ client: getSupabaseClient() })
  }, [])

  useEffect(() => {
    // The guest leaderboard only feeds the guest Look link (F09 #144).
    if (AUTH_REQUIRED) {
      return
    }

    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (!cancelled) {
          setLeaderId(rankDesigns({ designs })[0]?.id ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderId(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flv flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="flv-cta sr-only rounded-full px-4 py-2 font-body text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        // Without changing the URL, which the router would treat as a move.
        onClick={(event) => {
          event.preventDefault()
          main.current?.focus()
        }}
      >
        Skip to content
      </a>
      <header
        className={cn(
          'z-30 flex items-center justify-between gap-3 border-b border-flv-line bg-flv-paper/95 text-flv-ink backdrop-blur-sm',
          {
            'absolute inset-x-0 top-0 border-transparent bg-transparent px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5 sm:pb-5':
              isLanding,
            'sticky top-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-4 sm:pb-4':
              !isLanding,
          },
        )}
      >
        <Link
          to="/"
          search={{}}
          className="flex shrink-0 items-center gap-2.5 text-flv-ink"
        >
          <span className="flv-text-gradient font-display text-3xl leading-none">
            {FLV_COPY.brandMark}
          </span>
          <span className="hidden font-display text-[0.65rem] leading-[1.1] tracking-normal uppercase sm:block">
            Fashion
            <br />
            Leader Vote
          </span>
        </Link>
        {isLanding ? (
          <nav aria-label="Site" className="hidden items-center gap-8 font-body text-sm md:flex">
            {MARKETING_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 items-center border-b-2 border-transparent px-1 text-flv-muted hover:border-flv-accent hover:text-flv-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : (
          <nav aria-label="Site" className="flex items-center gap-2 font-body text-sm sm:gap-4">
            <NavLink
              to="/"
              label="Home"
              active={false}
            />
            <NavLink
              to="/create"
              label="Create"
              active={location.pathname === '/create'}
            />
            {AUTH_REQUIRED ? null : (
              <>
                <NavLink
                  to="/vote"
                  label="Vote"
                  active={location.pathname === '/vote'}
                />
                <Link
                  to="/look/$lookId"
                  params={{ lookId: lookId ?? HOUSE_LOOK_FALLBACK_ID }}
                  className={cn('inline-flex min-h-11 items-center px-1', {
                    'text-flv-accent': location.pathname.startsWith('/look/'),
                    'text-flv-muted hover:text-flv-accent':
                      !location.pathname.startsWith('/look/'),
                  })}
                >
                  Look
                </Link>
              </>
            )}
            <AccountControl />
          </nav>
        )}
        {isLanding ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <LandingAccountLink className="hidden min-h-11 items-center px-1 font-body text-sm text-flv-muted hover:text-flv-ink md:inline-flex" />
            <a
              href="#waitlist"
              className={buttonClass()}
            >
              {FLV_COPY.joinWaitlist}
              <ArrowRight aria-hidden className="size-4" />
            </a>
            <SiteMenu>
              {MARKETING_LINKS.map((link) => (
                <a key={link.href} href={link.href} className={MENU_LINK_CLASS}>
                  {link.label}
                </a>
              ))}
              <LandingAccountLink className={MENU_LINK_CLASS} />
            </SiteMenu>
          </div>
        ) : null}
      </header>
      <main
        ref={main}
        id="main-content"
        tabIndex={-1}
        data-focus-target
        className="relative flex-1 bg-flv-paper text-flv-ink"
      >
        <Outlet />
      </main>
      {showsSiteFooter({ pathname: location.pathname }) ? <SiteFooter /> : null}
    </div>
  )
}

function NavLink({
  to,
  label,
  active,
}: {
  to: '/' | '/create' | '/vote'
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      search={{}}
      className={cn('inline-flex min-h-11 items-center px-1', {
        'text-flv-accent': active,
        'text-flv-muted hover:text-flv-accent': !active,
      })}
    >
      {label}
    </Link>
  )
}
