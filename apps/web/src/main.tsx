import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import '@fontsource/roboto-slab/700.css'
import '@fontsource/oswald/600.css'
import '@fontsource/pacifico/400.css'
import '@fontsource/sedgwick-ave/400.css'
import '@fontsource/space-mono/700.css'
import '@fontsource/unifrakturmaguntia/400.css'
import { RouterProvider, createRouter, isNotFound, isRedirect } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouteError, RouteNotFound } from './components/ui/RouteFallbacks'
import { RoutePending } from './components/ui/RoutePending'
import { analyticsConfig, prefersNoTracking, startAnalytics } from './lib/analytics'
import { track } from './lib/assumption-events'
import { useEditorStore } from './lib/editor-store'
import { createErrorReporter, installWindowHandlers, sendToTunnel } from './lib/error-reporter'
import { installStudioAnalytics, watchErrorMessages } from './lib/studio-analytics'
import { startWebVitals } from './lib/web-vitals'
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

// Web Vitals ratings (P4, docs/operations.md), also production only.
if (import.meta.env.PROD) {
  void startWebVitals()
}

// Product analytics (docs/analytics.md): anonymous and cookieless, and
// only when VITE_POSTHOG_KEY is set and the browser doesn't ask not to be
// tracked. Without it, nothing loads and every event is counts only.
if (analyticsConfig({ env: import.meta.env }) && !prefersNoTracking()) {
  void startAnalytics({ env: import.meta.env })
  const send = (event: Parameters<typeof track>[0]) => void track(event)
  installStudioAnalytics({ store: useEditorStore as unknown as Parameters<typeof installStudioAnalytics>[0]['store'], track: send })
  watchErrorMessages({ track: send })
}

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
