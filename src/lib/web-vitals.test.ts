import type { Metric } from 'web-vitals'
import { describe, expect, test } from 'vitest'

import { startWebVitals, vitalReport } from './web-vitals'

describe('Web Vitals (P4)', () => {
  test('sends only the rating of LCP, INP and CLS', () => {
    expect(vitalReport({ metric: { name: 'LCP', rating: 'good' } })).toEqual({ name: 'lcp', rating: 'good' })
    expect(vitalReport({ metric: { name: 'INP', rating: 'needs-improvement' } })).toEqual({
      name: 'inp',
      rating: 'needs_improvement',
    })
    expect(vitalReport({ metric: { name: 'CLS', rating: 'poor' } })).toEqual({ name: 'cls', rating: 'poor' })
    expect(vitalReport({ metric: { name: 'TTFB', rating: 'good' } })).toBeNull()
    expect(vitalReport({ metric: { name: 'FCP', rating: 'poor' } })).toBeNull()
  })

  test('subscribes to the three vitals and forwards what they report', async () => {
    const sent: unknown[] = []
    const fire =
      (name: Metric['name'], rating: Metric['rating']) => (callback: (metric: Pick<Metric, 'name' | 'rating'>) => void) =>
        callback({ name, rating })

    await startWebVitals({
      load: async () => ({ onLCP: fire('LCP', 'good'), onINP: fire('INP', 'poor'), onCLS: fire('CLS', 'good') }),
      send: (report) => sent.push(report),
    })

    expect(sent).toEqual([
      { name: 'lcp', rating: 'good' },
      { name: 'inp', rating: 'poor' },
      { name: 'cls', rating: 'good' },
    ])
  })

  test('a failed library load is quiet', async () => {
    await expect(startWebVitals({ load: () => Promise.reject(new Error('offline')), send: () => {} })).resolves.toBeUndefined()
  })
})
