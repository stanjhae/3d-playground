/** Prior wins and losses so a single pick cannot outrank a long record. */
export const COMPARISON_PRIOR = 2

/**
 * Confidence-adjusted win rate. With no picks, every design scores the
 * same, and the vote count decides the order.
 */
export function comparisonScore({
  wins,
  losses,
  prior = COMPARISON_PRIOR,
}: {
  wins: number
  losses: number
  prior?: number
}) {
  return (wins + prior) / (wins + losses + prior * 2)
}

/** Two designs to show next: fewest recent impressions first, then newest. */
export function pickComparison({
  designs,
}: {
  designs: readonly { slug: string; impressions: number; publishedAt: string }[]
}): [string, string] | null {
  if (designs.length < 2) {
    return null
  }

  const ordered = [...designs].sort(
    (left, right) =>
      left.impressions - right.impressions || right.publishedAt.localeCompare(left.publishedAt) || left.slug.localeCompare(right.slug),
  )

  return [ordered[0]!.slug, ordered[1]!.slug]
}

/** A shared rank, as "=3". */
export function tieLabel({ rank }: { rank: number }) {
  return `=${rank}`
}

export function orderedPair({ left, right }: { left: string; right: string }): { slugLow: string; slugHigh: string } | null {
  if (left === right) {
    return null
  }

  return left < right ? { slugLow: left, slugHigh: right } : { slugLow: right, slugHigh: left }
}
