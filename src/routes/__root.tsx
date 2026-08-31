import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useMatch,
} from '@tanstack/react-router'

import { lookIdFromPathname } from '../lib/paths'

export const Route = createRootRoute({
  component: RootShell,
})

function RootShell() {
  const lookMatch = useMatch({
    from: '/look/$lookId',
    shouldThrow: false,
  })
  const location = useLocation()
  const lookId =
    lookMatch?.params.lookId ??
    lookIdFromPathname({ pathname: location.pathname })

  return (
    <>
      <header className="flex items-center justify-between border-b border-atelier-line bg-atelier px-6 py-5 text-ivory">
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
            className="hover:text-brass"
            activeProps={{ className: 'text-brass' }}
          >
            Vote
          </Link>
          <Link
            to="/look/$lookId"
            params={{ lookId }}
            className="hover:text-brass"
            activeProps={{ className: 'text-brass' }}
          >
            Look
          </Link>
        </nav>
      </header>
      <main className="min-h-dvh bg-atelier text-ivory">
        <Outlet />
      </main>
    </>
  )
}
