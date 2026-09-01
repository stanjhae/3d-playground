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
  const isCover =
    location.pathname === '/' || location.pathname.startsWith('/look/')

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
          'z-30 flex items-center justify-between gap-3 text-ivory',
          {
            'absolute inset-x-0 top-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5 sm:pb-5':
              isCover,
            'border-b border-atelier-line bg-atelier px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5 sm:pb-5':
              !isCover,
          },
        )}
      >
        <Link
          to="/"
          search={{}}
          className="shrink-0 whitespace-nowrap font-display text-[11px] tracking-[0.16em] text-ivory uppercase sm:text-sm sm:tracking-[0.28em]"
        >
          Fashion Leader Vote
        </Link>
        <nav className="flex items-center gap-1 text-[10px] tracking-[0.12em] uppercase sm:gap-3 sm:text-xs sm:tracking-[0.18em]">
          <Link
            to="/"
            search={{}}
            className={cn(
              'inline-flex min-h-11 items-center px-1',
              {
                'text-brass': location.pathname === '/',
                'text-ivory-muted hover:text-brass': location.pathname !== '/',
              },
            )}
          >
            Atelier
          </Link>
          <Link
            to="/vote"
            search={{}}
            className={cn(
              'inline-flex min-h-11 items-center px-1',
              {
                'text-brass': location.pathname === '/vote',
                'text-ivory-muted hover:text-brass':
                  location.pathname !== '/vote',
              },
            )}
          >
            Vote
          </Link>
          <Link
            to="/look/$lookId"
            params={{ lookId: lookId ?? HOUSE_LOOK_FALLBACK_ID }}
            className={cn(
              'inline-flex min-h-11 items-center px-1',
              {
                'text-brass': location.pathname.startsWith('/look/'),
                'text-ivory-muted hover:text-brass':
                  !location.pathname.startsWith('/look/'),
              },
            )}
          >
            Look
          </Link>
        </nav>
      </header>
      <main className="relative min-h-dvh bg-atelier text-ivory">
        <Outlet />
      </main>
    </>
  )
}
