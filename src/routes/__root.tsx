import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useMatch,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { cn } from '../lib/cn'
import { listDesigns } from '../lib/designs-api'
import { FLV_COPY } from '../lib/flv-copy'
import { HOUSE_LOOK_FALLBACK_ID, lookIdFromPathname } from '../lib/paths'
import { rankDesigns } from '../lib/rank-designs'

export const Route = createRootRoute({
  component: RootShell,
})

const MARKETING_LINKS = [
  { href: '#product', label: FLV_COPY.navProduct },
  { href: '#flow', label: FLV_COPY.navHowItWorks },
  { href: '#community', label: FLV_COPY.navCommunity },
  { href: '#waitlist', label: FLV_COPY.navAbout },
] as const

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
  const isCover =
    location.pathname === '/create' || location.pathname.startsWith('/look/')

  useEffect(() => {
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
    <>
      <header
        className={cn(
          'z-30 flex items-center justify-between gap-3',
          {
            'absolute inset-x-0 top-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-flv-ink sm:px-6 sm:pt-5 sm:pb-5':
              isLanding,
            'absolute inset-x-0 top-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-ivory sm:px-6 sm:pt-5 sm:pb-5':
              isCover,
            'border-b border-atelier-line bg-atelier px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-ivory sm:px-6 sm:pt-5 sm:pb-5':
              !isLanding && !isCover,
          },
        )}
      >
        <Link
          to="/"
          search={{}}
          className={cn('flex shrink-0 items-end gap-2', {
            'text-flv-ink': isLanding,
            'text-ivory': !isLanding,
          })}
        >
          <span
            className={cn('font-display text-2xl leading-none tracking-tight', {
              'text-flv-accent': isLanding,
              'text-brass': !isLanding,
            })}
          >
            {FLV_COPY.brandMark}
          </span>
          <span className="hidden pb-0.5 font-body text-[0.55rem] leading-tight tracking-[0.16em] uppercase sm:block">
            Fashion
            <br />
            Leader Vote
          </span>
        </Link>
        {isLanding ? (
          <nav className="hidden items-center gap-4 font-body text-xs tracking-[0.1em] uppercase md:flex">
            {MARKETING_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 items-center border-b-2 border-transparent px-1 text-flv-muted hover:border-flv-accent hover:text-flv-accent"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : (
          <nav className="flex items-center gap-2 font-body text-xs tracking-[0.08em] uppercase sm:gap-3">
            <NavLink
              to="/"
              label="Home"
              active={false}
              flv={false}
            />
            <NavLink
              to="/create"
              label="Create"
              active={location.pathname === '/create'}
              flv={false}
            />
            <NavLink
              to="/vote"
              label="Vote"
              active={location.pathname === '/vote'}
              flv={false}
            />
            <Link
              to="/look/$lookId"
              params={{ lookId: lookId ?? HOUSE_LOOK_FALLBACK_ID }}
              className={cn('inline-flex min-h-11 items-center px-1', {
                'text-brass': location.pathname.startsWith('/look/'),
                'text-ivory-muted hover:text-brass':
                  !location.pathname.startsWith('/look/'),
              })}
            >
              Look
            </Link>
          </nav>
        )}
        {isLanding ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('waitlist')
                  ?.scrollIntoView({ behavior: 'smooth' })
                window.requestAnimationFrame(() => {
                  const input = document.querySelector<HTMLInputElement>(
                    '#waitlist input[type="email"]',
                  )
                  input?.focus()
                })
              }}
              className="hidden min-h-11 items-center px-1 font-body text-xs tracking-[0.1em] text-flv-muted uppercase hover:text-flv-accent sm:inline-flex"
            >
              {FLV_COPY.login}
            </button>
            <a
              href="#waitlist"
              className="flv-cta inline-flex min-h-10 items-center px-4 font-body text-[0.65rem] tracking-[0.1em] uppercase sm:min-h-11 sm:text-xs"
            >
              {FLV_COPY.joinWaitlist} →
            </a>
          </div>
        ) : null}
      </header>
      <main
        className={cn('relative min-h-dvh', {
          'bg-flv-paper text-flv-ink': isLanding,
          'bg-atelier text-ivory': !isLanding,
        })}
      >
        <Outlet />
      </main>
    </>
  )
}

function NavLink({
  to,
  label,
  active,
  flv,
}: {
  to: '/' | '/create' | '/vote'
  label: string
  active: boolean
  flv: boolean
}) {
  return (
    <Link
      to={to}
      search={{}}
      className={cn('inline-flex min-h-11 items-center px-1', {
        'text-flv-accent': flv && active,
        'text-flv-muted hover:text-flv-accent': flv && !active,
        'text-brass': !flv && active,
        'text-ivory-muted hover:text-brass': !flv && !active,
      })}
    >
      {label}
    </Link>
  )
}
