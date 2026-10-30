import type { CanonicalDocument } from './canonical-document.ts'

/**
 * Content identity for canonical documents (FLP F05).
 *
 * Normalization is what gets stored, so a document hashes the same before
 * save and after reload: strings are NFC, numbers keep six decimals (with
 * -0 written as 0), object keys are sorted by code unit and array order is
 * kept. The hash is SHA-256 over the UTF-8 of that serialization.
 */

export const NUMBER_DECIMALS = 6

const NUMBER_FACTOR = 10 ** NUMBER_DECIMALS

export type ContentHash = `sha256:${string}`

export function roundCanonicalNumber({ value }: { value: number }) {
  const rounded = Math.round(value * NUMBER_FACTOR) / NUMBER_FACTOR
  return Object.is(rounded, -0) ? 0 : rounded
}

function normalizeValue({ value }: { value: unknown }): unknown {
  if (typeof value === 'string') {
    return value.normalize('NFC')
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical documents cannot hold non-finite numbers')
    }

    return roundCanonicalNumber({ value })
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue({ value: item }))
  }

  if (typeof value === 'object' && value !== null) {
    const next: Record<string, unknown> = {}

    for (const key of Object.keys(value).sort()) {
      next[key] = normalizeValue({
        value: (value as Record<string, unknown>)[key],
      })
    }

    return next
  }

  return value
}

/** The stored form: NFC strings, rounded numbers, sorted keys. */
export function normalizeCanonicalDocument({
  document,
}: {
  document: CanonicalDocument
}): CanonicalDocument {
  return normalizeValue({ value: document }) as CanonicalDocument
}

export function serializeCanonicalDocument({
  document,
}: {
  document: CanonicalDocument
}) {
  return JSON.stringify(normalizeCanonicalDocument({ document }))
}

export async function hashCanonicalDocument({
  document,
}: {
  document: CanonicalDocument
}): Promise<ContentHash> {
  const bytes = new TextEncoder().encode(
    serializeCanonicalDocument({ document }),
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

  return `sha256:${hex}`
}
