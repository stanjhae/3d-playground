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
        className={
          isCover
            ? 'absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5 text-ivory'
            : 'flex items-center justify-between border-b border-atelier-line bg-atelier px-6 py-5 text-ivory'
        }
      >
        <Link
          to="/"
          search={{}}
          className="font-display text-sm tracking-[0.28em] text-ivory uppercase"
        >
          Fashion Leader Vote
        </Link>
        <nav className="flex items-center gap-3 text-xs tracking-[0.18em] uppercase">
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
