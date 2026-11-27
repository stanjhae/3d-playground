import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { type Plugin, loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/** The repo root: .env files live there, shared by every app in the workspace. */
const ENV_DIR = fileURLToPath(new URL('../..', import.meta.url))

async function toRequest(req: IncomingMessage) {
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }

  return new Request(`http://localhost${req.url}`, { method: req.method, headers })
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

/**
 * Serves `api/*` in dev the way Vercel does in production, with the
 * server-only SUPABASE_* values from the root .env.local.
 */
function adminApi(): Plugin {
  return {
    name: 'flv-admin-api',
    config(_config, { mode }) {
      for (const [key, value] of Object.entries(loadEnv(mode, ENV_DIR, ['SUPABASE_']))) {
        process.env[key] ??= value
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next()
        }

        const { handleAdminRequest } = (await server.ssrLoadModule('/src/server/handlers.ts')) as typeof import('./src/server/handlers.ts')
        await send(res, await handleAdminRequest({ request: await toRequest(req) }))
      })
    },
  }
}

export default defineConfig({
  envDir: ENV_DIR,
  plugins: [react(), tailwindcss(), adminApi()],
  test: { include: ['src/**/*.test.ts'] },
})
