import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useMatch,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { listDesigns } from '../lib/designs-api'
import { lookIdFromPathname } from '../lib/paths'
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
        <nav className="flex items-center gap-6 text-xs tracking-[0.18em] text-ivory-muted uppercase">
          <Link
            to="/"
            search={{}}
            className="hover:text-brass"
            activeProps={{ className: 'text-brass' }}
          >
            Atelier
          </Link>
          <Link
            to="/vote"
            search={{}}
            className="hover:text-brass"
            activeProps={{ className: 'text-brass' }}
          >
            Vote
          </Link>
          {lookId ? (
            <Link
              to="/look/$lookId"
              params={{ lookId }}
              className="hover:text-brass"
              activeProps={{ className: 'text-brass' }}
            >
              Look
            </Link>
          ) : null}
        </nav>
      </header>
      <main className="relative min-h-dvh bg-atelier text-ivory">
        <Outlet />
      </main>
    </>
  )
}
