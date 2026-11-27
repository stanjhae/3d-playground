import type { Metric } from 'web-vitals'

import { type VitalEvent, type VitalRating, trackVital } from './assumption-events'

type Reported = Pick<Metric, 'name' | 'rating'>
type Subscribe = (onReport: (metric: Reported) => void) => void

const NAMES: Record<string, VitalEvent> = { LCP: 'lcp', INP: 'inp', CLS: 'cls' }

const RATINGS: Record<Metric['rating'], VitalRating> = {
  good: 'good',
  'needs-improvement': 'needs_improvement',
  poor: 'poor',
}

/** The count a metric adds to, or null for a metric this site doesn't count. */
export function vitalReport({ metric }: { metric: Reported }) {
  const name = NAMES[metric.name]
  const rating = RATINGS[metric.rating]

  return name && rating ? { name, rating } : null
}

/**
 * Counts each page load's LCP, INP and CLS rating (P4, docs/operations.md).
 * The library loads after the page, off the critical path.
 */
export function startWebVitals({
  load = () => import('web-vitals'),
  send = trackVital,
}: {
  load?: () => Promise<{ onLCP: Subscribe; onINP: Subscribe; onCLS: Subscribe }>
  send?: typeof trackVital
} = {}) {
  const report = (metric: Reported) => {
    const counted = vitalReport({ metric })

    if (counted) {
      send(counted)
    }
  }

  return load()
    .then(({ onLCP, onINP, onCLS }) => {
      onLCP(report)
      onINP(report)
      onCLS(report)
    })
    .catch(() => undefined)
}
