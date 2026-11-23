import { describe, expect, test } from 'vitest'

import routeTree from '../routeTree.gen.ts?raw'
import vercelJson from '../../vercel.json?raw'

/**
 * vercel.json sends only the app's own routes to the app shell; any other
 * path gets dist/404.html with a real 404 status (an outside tester found
 * missing pages answered 200, 19 Nov). A new route must be added there too,
 * or it would 404 on beta.
 */

type Rewrite = { source: string; destination: string; has?: unknown[] }
type Redirect = { source: string; destination: string; permanent?: boolean }

const config = JSON.parse(vercelJson) as { rewrites: Rewrite[]; redirects?: Redirect[] }
const rewrites = config.rewrites
const redirects = config.redirects ?? []

/** Vercel's source patterns, as far as this file uses them: groups, `:param` and `:param*`. */
function sourceToRegex(source: string) {
  const pattern = source
    .replace(/:[a-zA-Z]+\*/g, '.*')
    .replace(/:[a-zA-Z]+/g, '[^/]+')
  return new RegExp(`^${pattern}$`)
}

/** Paths that reach the app shell for every visitor (no `has` condition). */
function servesApp(path: string) {
  if (path === '/') {
    // The prerendered landing (dist/index.html) is a static file.
    return true
  }

  return rewrites.some((rule) => rule.destination === '/app.html' && !rule.has && sourceToRegex(rule.source).test(path))
}

/** Each route the router knows, with a sample value for any `$param`. */
function appRoutes() {
  const paths = new Set<string>()
  for (const match of routeTree.matchAll(/fullPath: '([^']+)'/g)) {
    paths.add(match[1]!.replace(/\$[a-zA-Z]+/g, 'sample-1'))
  }
  return [...paths]
}

describe('vercel.json routes', () => {
  test('every app route reaches the app shell', () => {
    const routes = appRoutes()
    expect(routes).toEqual(expect.arrayContaining(['/', '/create', '/studio', '/vote']))

    for (const path of routes) {
      // The catch-all is what the 404 document renders. Rewriting it would
      // answer unknown URLs with 200.
      if (path === '/$') {
        expect(servesApp('/nope'), 'the catch-all must not be a rewrite').toBe(false)
        continue
      }

      // Shared designs go through the share-page function, which serves the shell itself.
      if (path.startsWith('/s/')) {
        expect(rewrites.some((rule) => rule.source === '/s/:slug')).toBe(true)
        continue
      }

      expect(servesApp(path), `${path} is an app route but vercel.json doesn't send it to /app.html`).toBe(true)
    }
  })

  test('an unknown path is not rewritten to the app, so it gets the 404 page', () => {
    for (const path of ['/nope', '/create-something', '/studio/extra', '/vote/1/2', '/u']) {
      expect(servesApp(path), `${path} would answer 200`).toBe(false)
    }
  })

  test('/sign-up redirects to sign-in and is not an app rewrite', () => {
    expect(redirects).toContainEqual({ source: '/sign-up', destination: '/sign-in', permanent: false })
    expect(servesApp('/sign-up')).toBe(false)
  })
})
