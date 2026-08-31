import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vitest/config'

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

  if (pathname === '/api/og') {
    const { GET } = await import('./api/og.ts')
    return GET(request)
  }

  if (pathname === '/api/og-page') {
    const { GET } = await import('./api/og-page.ts')
    return GET(request)
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
}: {
  req: IncomingMessage
  res: ServerResponse
  next: () => void
}) {
  const url = req.originalUrl ?? req.url ?? ''

  if (!url.startsWith('/api/')) {
    next()
    return
  }

  try {
    const request = await incomingToRequest({ req })
    const response = await dispatchApi({ request })

    res.statusCode = response.status
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

function flvApiPlugin(): Plugin {
  return {
    name: 'flv-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest({ req, res, next })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest({ req, res, next })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    flvApiPlugin(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
