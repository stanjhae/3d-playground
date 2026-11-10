import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import { RouterProvider, createRouter, isNotFound, isRedirect } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouteError, RouteNotFound } from './components/ui/RouteFallbacks'
import { RoutePending } from './components/ui/RoutePending'
import { createErrorReporter, installWindowHandlers, sendToTunnel } from './lib/error-reporter'
import { routeTree } from './routeTree.gen'
import './styles.css'

const router = createRouter({
  routeTree,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 300,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Error reports (O1, docs/alerts.md). Production builds only, so local
// work and dev servers never send anything.
const report = createErrorReporter({ send: import.meta.env.PROD ? sendToTunnel : () => {} })
installWindowHandlers({ target: window, report })

/** Router control flow (a redirect or a not-found) is thrown, but isn't a fault. */
function reportReactError({ error, mechanism }: { error: unknown; mechanism: string }) {
  if (!isRedirect(error) && !isNotFound(error)) {
    report({ error, mechanism })
  }
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root')
}

createRoot(rootElement, {
  // A route's error boundary caught it and showed "Something went wrong".
  onCaughtError(error, info) {
    console.error(error, info.componentStack)
    reportReactError({ error, mechanism: 'react-boundary' })
  },
  // Nothing caught it: React unmounted the app.
  onUncaughtError(error, info) {
    console.error(error, info.componentStack)
    reportReactError({ error, mechanism: 'react-uncaught' })
  },
}).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
