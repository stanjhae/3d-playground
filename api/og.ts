import { ogDefaultRelativePath, ogStillRelativePath } from '../src/lib/og-card.ts'

function processCwd() {
  return (
    (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ''
  )
}

async function readPng({ relativePath }: { relativePath: string }) {
  const { readFile } = (await import(
    // @ts-expect-error Node built-in; the OG function runs on Node
    'node:fs/promises'
  )) as { readFile: (path: string) => Promise<Uint8Array> }
  const { join } = (await import(
    // @ts-expect-error Node built-in
    'node:path'
  )) as { join: (...parts: string[]) => string }

  return readFile(join(processCwd(), relativePath))
}

export async function GET(request?: Request) {
  const url = new URL(request?.url ?? 'http://localhost/api/og')
  const lookId = url.searchParams.get('lookId')
  const stillPath = ogStillRelativePath({ lookId })
  const fallbackPath = ogDefaultRelativePath()

  let bytes: Uint8Array

  try {
    bytes = stillPath
      ? await readPng({ relativePath: stillPath })
      : await readPng({ relativePath: fallbackPath })
  } catch {
    bytes = await readPng({ relativePath: fallbackPath })
  }

  const payload = new Uint8Array(bytes.byteLength)
  payload.set(bytes)

  return new Response(payload, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

export default {
  fetch(request: Request) {
    return GET(request)
  },
}
