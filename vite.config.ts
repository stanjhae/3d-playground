import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv } from 'vite'
import { defineConfig, type Plugin } from 'vitest/config'

import { securityHeaders, supabaseMetaPolicy, supabaseOrigin } from './src/lib/security-headers.ts'

async function incomingToRequest({
  req,
}: {
  req: IncomingMessage
}): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = `http://${host}${req.originalUrl ?? req.url ?? '/'}`
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
    } else if (value) {
      headers.set(key, value)
    }
  }

  const method = req.method ?? 'GET'

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }

  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return new Request(url, {
    method,
    headers,
    body: Buffer.concat(chunks),
    duplex: 'half',
  } as RequestInit)
}

async function dispatchApi({ request }: { request: Request }) {
  const { pathname } = new URL(request.url)

  if (pathname === '/api/flp' || pathname.startsWith('/api/flp/')) {
    const { handleFlpRequest } = await import('./src/lib/flp-api/server.ts')
    return handleFlpRequest({ request })
  }

  if (pathname === '/api/og') {
    const { GET } = await import('./api/og.ts')
    return GET(request)
  }

  if (pathname === '/api/og-page') {
    const { GET } = await import('./api/og-page.ts')
    return GET(request)
  }

  if (pathname === '/api/waitlist') {
    const { POST } = await import('./api/waitlist.ts')

    if (request.method === 'POST') {
      return POST(request)
    }
  }

  if (pathname === '/api/events') {
    const { POST } = await import('./api/events.ts')

    if (request.method === 'POST') {
      return POST(request)
    }
  }

  if (
    pathname === '/api/designs' ||
    /^\/api\/designs\/[^/]+\/vote$/.test(pathname)
  ) {
    const { GET, POST } = await import('./api/designs.ts')

    if (request.method === 'GET') {
      return GET(request)
    }

    if (request.method === 'POST') {
      return POST(request)
    }
  }

  return Response.json({ error: 'Not found' }, { status: 404 })
}

async function handleApiRequest({
  req,
  res,
  next,
  headers,
}: {
  req: IncomingMessage
  res: ServerResponse
  next: () => void
  headers: Record<string, string>
}) {
  const url = req.originalUrl ?? req.url ?? ''
  // `/s/:slug` is served by the share page for everyone, as on Vercel (#182).
  const isSharePage = /^\/s\/[^/?.]+\/?(\?.*)?$/.test(url)

  if (!url.startsWith('/api/') && !isSharePage) {
    next()
    return
  }

  try {
    const request = await incomingToRequest({ req })
    const response = isSharePage
      ? await (await import('./src/lib/flp-api/share-page.ts')).handleSharePage({ request })
      : await dispatchApi({ request })

    res.statusCode = response.status
    // Vercel adds vercel.json headers to function responses too.
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value)
    }
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'The board could not load' }))
  }
}

function flvApiPlugin({
  headers,
  previewHeaders,
}: {
  headers: Record<string, string>
  previewHeaders: Record<string, string>
}): Plugin {
  return {
    name: 'flv-api',
    config(_config, { mode }) {
      // Server-only SUPABASE_* values from .env.local for the dev API, the
      // way Vercel provides them in production. Never exposed to the client.
      // VITE_FLP_REQUIRE_AUTH tells the guest board whether it is closed (#144).
      for (const [key, value] of Object.entries(
        loadEnv(mode, process.cwd(), ['SUPABASE_', 'VITE_FLP_REQUIRE_AUTH']),
      )) {
        process.env[key] ??= value
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest({ req, res, next, headers })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest({ req, res, next, headers: previewHeaders })
      })
    },
  }
}

/**
 * The page narrows the deployed policy's Supabase wildcard to the
 * configured project (Q02 #187); see src/lib/security-headers.ts.
 */
function supabaseCspPlugin({ supabase }: { supabase: string | null }): Plugin {
  return {
    name: 'flv-supabase-csp',
    transformIndexHtml() {
      return supabase
        ? [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: supabaseMetaPolicy({ supabase }) },
              injectTo: 'head-prepend',
            },
          ]
        : []
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const supabase = supabaseOrigin({ url: loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL })
  // Vite's dev client injects its React refresh preamble and CSS inline;
  // a per-start nonce lets them run under the same policy as production.
  const devNonce = command === 'serve' ? crypto.randomUUID().replaceAll('-', '') : undefined

  const headers = securityHeaders({ supabase, devNonce })
  const previewHeaders = securityHeaders({ supabase })

  return {
    html: devNonce ? { cspNonce: devNonce } : {},
    server: { headers },
    preview: { headers: previewHeaders },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
      flvApiPlugin({ headers, previewHeaders }),
      supabaseCspPlugin({ supabase }),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
