import { describe, expect, it } from 'vitest'

/**
 * The API server runs under Node, where `import.meta.env` is undefined.
 * The browser client reads it on import, so reaching it from the server
 * fails every API request (PR 427: all signed-in journeys broke).
 * Vitest defines `import.meta.env`, so only a look at the imports catches it.
 */
const BROWSER_ONLY = ['/src/lib/flp-api/client.ts', '/src/lib/auth/supabase-client.ts']

const SOURCES = import.meta.glob<string>('/src/**/*.{ts,tsx,mts,mjs}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function join({ from, spec }: { from: string; spec: string }) {
  const parts = from.split('/').slice(0, -1)

  for (const part of spec.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '.') {
      parts.push(part)
    }
  }

  const path = parts.join('/')
  return /\.(m?[jt]s|tsx)$/.test(path) ? path : `${path}.ts`
}

function relativeImports({ file }: { file: string }) {
  const source = SOURCES[file] ?? ''
  const specs = [
    // Runtime imports and re-exports; `import type` is erased.
    ...source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+'(\.[^']+)'/gm),
    ...source.matchAll(/^\s*import\s+'(\.[^']+)'/gm),
  ].map((match) => match[1]!)

  return specs.map((spec) => join({ from: file, spec }))
}

function reachable({ entry }: { entry: string }) {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()!

    if (!seen.has(file)) {
      seen.add(file)
      queue.push(...relativeImports({ file }))
    }
  }

  return seen
}

describe('API server imports', () => {
  it('never load the browser client', () => {
    const entry = '/src/lib/flp-api/server.ts'
    expect(SOURCES[entry]).toBeDefined()
    const files = reachable({ entry })

    for (const browserOnly of BROWSER_ONLY) {
      expect(files.has(browserOnly), browserOnly).toBe(false)
    }
  })
})
