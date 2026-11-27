import { sharedDrapeClient } from '../cloth/shared-drape.ts'
import type { CanonicalPattern } from './pattern-document.ts'
import { storeMesh } from './mesh-sync.ts'

const DRAPE_TIMEOUT_MS = 60_000

/**
 * Before a publish: the drape of `pattern` (the studio's, or one joined
 * while it runs, or a fresh one) stored on the server. Asks the drape
 * client itself rather than a status flag, so two views of the garment
 * racing can't leave it looking unfinished.
 */
export async function drapeAndStore({ pattern }: { pattern: CanonicalPattern }): Promise<'stored' | 'timeout' | 'failed'> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const mesh = await Promise.race([
      sharedDrapeClient().drape({ pattern }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), DRAPE_TIMEOUT_MS)
      }),
    ])

    if (!mesh) {
      return 'timeout'
    }

    return (await storeMesh({ pattern, mesh })) ? 'stored' : 'failed'
  } catch {
    return 'failed'
  } finally {
    clearTimeout(timer)
  }
}
