import type { Design } from './design-schema.ts'
import { MAX_THUMBNAIL_CHARS } from './look-thumbnail.ts'

/** Soft per-look budget so a few publishes do not blow the board. */
export const MAX_LOOK_PAYLOAD_CHARS = 900_000

export const MAX_BOARD_CHARS_SOFT = 7_500_000

function payloadChars({ designs }: { designs: Design[] }) {
  return JSON.stringify(designs).length
}

export function trimAngleStillsForLook({
  angleStills,
  artMap = '',
  hasDocument = false,
}: {
  angleStills: string[]
  artMap?: string
  hasDocument?: boolean
}): string[] {
  if (angleStills.length === 0) {
    return []
  }

  const base =
    artMap.length + (hasDocument ? 120_000 : 0) + MAX_THUMBNAIL_CHARS
  const room = Math.max(0, MAX_LOOK_PAYLOAD_CHARS - base)

  if (room < 40_000) {
    return []
  }

  const kept: string[] = []
  let used = 0

  for (const still of angleStills) {
    if (used + still.length > room) {
      break
    }

    kept.push(still)
    used += still.length

    if (kept.length >= 3) {
      break
    }
  }

  return kept
}

export function stripAngleStillsUntilFit({
  designs,
  maxChars = MAX_BOARD_CHARS_SOFT,
}: {
  designs: Design[]
  maxChars?: number
}): Design[] {
  let next = designs.map((design) => ({
    ...design,
    ...(design.angleStills ? { angleStills: [...design.angleStills] } : {}),
  }))

  if (payloadChars({ designs: next }) <= maxChars) {
    return next
  }

  const guestIndexes = next
    .map((design, index) => ({ design, index }))
    .filter(({ design }) => !design.id.startsWith('look-atelier'))
    .sort((left, right) => left.design.votes - right.design.votes)

  for (const { index } of guestIndexes) {
    const design = next[index]

    if (!design?.angleStills?.length) {
      continue
    }

    next = next.map((entry, entryIndex) => {
      if (entryIndex !== index) {
        return entry
      }

      const { angleStills: _drop, ...rest } = entry
      return rest
    })

    if (payloadChars({ designs: next }) <= maxChars) {
      return next
    }
  }

  return next
}
