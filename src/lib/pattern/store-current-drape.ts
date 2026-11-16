import { sharedDrapeClient } from '../cloth/shared-drape.ts'
import type { CanonicalPattern } from './pattern-document.ts'
import { storeMesh } from './mesh-sync.ts'

/** Stores the studio's finished drape of `pattern` (before a publish). False if there is none or it fails. */
export async function storeCurrentDrape({ pattern }: { pattern: CanonicalPattern }) {
  const mesh = await sharedDrapeClient().cached({ pattern })
  return mesh ? storeMesh({ pattern, mesh }) : false
}
