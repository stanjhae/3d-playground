import {
  getStoredDesign,
  hydrateDesignsStore,
} from '../src/lib/designs-store.ts'
import { imageFromDataUrl, isSafeThumbnail } from '../src/lib/look-thumbnail.ts'
import { ogDefaultRelativePath, ogStillRelativePath } from '../src/lib/og-card.ts'

function processCwd() {
  return (
    (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ''
  )
}

async function readFileBytes({ relativePath }: { relativePath: string }) {
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

  if (stillPath) {
    try {
      const bytes = await readFileBytes({ relativePath: stillPath })
      const payload = new Uint8Array(bytes.byteLength)
      payload.set(bytes)

      return new Response(payload, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      // Guest looks have no house still file.
    }
  }

  if (lookId) {
    await hydrateDesignsStore()
    const design = getStoredDesign({ id: lookId })
    const thumb = design?.thumbnailDataUrl ?? ''

    if (isSafeThumbnail({ thumbnailDataUrl: thumb }) && thumb.startsWith('data:')) {
      const image = imageFromDataUrl({ dataUrl: thumb })

      if (image) {
        return new Response(image.bytes, {
          headers: {
            'Content-Type': image.type,
            'Cache-Control': 'public, max-age=300',
          },
        })
      }
    }
  }

  const fallback = await readFileBytes({ relativePath: fallbackPath })
  const payload = new Uint8Array(fallback.byteLength)
  payload.set(fallback)

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
