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
import { HOUSE_LOOK_FALLBACK_ID, lookIdFromPathname } from '../lib/paths'
import { rankDesigns } from '../lib/rank-designs'

export const Route = createRootRoute({
  component: RootShell,
})

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
          className={cn(
            'shrink-0 whitespace-nowrap font-display text-xs tracking-[0.14em] uppercase sm:text-sm sm:tracking-[0.22em]',
            {
              'text-flv-ink': isLanding,
              'text-ivory': !isLanding,
            },
          )}
        >
          Fashion Leader Vote
        </Link>
        <nav className="flex items-center gap-2 font-body text-xs tracking-[0.08em] uppercase sm:gap-3">
          <NavLink
            to="/"
            label="Home"
            active={isLanding}
            flv={isLanding}
          />
          <NavLink
            to="/create"
            label="Create"
            active={location.pathname === '/create'}
            flv={isLanding}
          />
          <NavLink
            to="/vote"
            label="Vote"
            active={location.pathname === '/vote'}
            flv={isLanding}
          />
          <Link
            to="/look/$lookId"
            params={{ lookId: lookId ?? HOUSE_LOOK_FALLBACK_ID }}
            className={cn('inline-flex min-h-11 items-center px-1', {
              'text-flv-accent':
                isLanding && location.pathname.startsWith('/look/'),
              'text-flv-muted hover:text-flv-accent':
                isLanding && !location.pathname.startsWith('/look/'),
              'text-brass':
                !isLanding && location.pathname.startsWith('/look/'),
              'text-ivory-muted hover:text-brass':
                !isLanding && !location.pathname.startsWith('/look/'),
            })}
          >
            Look
          </Link>
        </nav>
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
