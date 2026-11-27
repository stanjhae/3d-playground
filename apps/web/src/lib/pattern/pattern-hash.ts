import { type ContentHash, serializeCanonicalValue, sha256Hex } from '../canonical-hash.ts'
import type { CanonicalPattern } from './pattern-document.ts'

/**
 * A pattern's identity, shared by the studio and the server: the SHA-256
 * of its stored form. A draped mesh is kept per pattern hash (and solver
 * version), so an edit that leaves the pattern alone reuses its mesh.
 */
export async function hashPattern({ pattern }: { pattern: CanonicalPattern }): Promise<ContentHash> {
  return `sha256:${await sha256Hex({ text: serializeCanonicalValue({ value: pattern }) })}`
}
