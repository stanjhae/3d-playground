import { describe, expect, test } from 'vitest'

import config from '../../playwright.config.ts?raw'

/**
 * The browser tests build the app with a flag profile (playwright.config.ts,
 * `E2E_FLAGS`). Every feature flag the app reads must be set explicitly
 * there: one left out takes its value from the shell or an .env file, and
 * the "beta" and "off" profiles quietly stop meaning what they say (a review
 * of #414 found VITE_SHAPE_ALL_GARMENTS missing from both).
 */

/** Flags the app reads as on/off switches: `import.meta.env.VITE_X === 'true'`. */
function switchesReadByTheApp() {
  const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const names = new Set<string>()
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)\s*===\s*'true'/g)) {
      names.add(match[1]!)
    }
  }
  return names
}

describe('e2e flag profiles', () => {
  const keys = new Set([...(config.match(/const FLAG_KEYS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]!))

  test('every on/off flag the app reads is set by every profile, or pinned off', () => {
    const read = switchesReadByTheApp()
    // The scan really ran: a glob that matched nothing would pass vacuously.
    expect([...read]).toEqual(expect.arrayContaining(['VITE_PATTERN_BETA', 'VITE_AI_ASSIST', 'VITE_COMMUNITY']))

    for (const name of read) {
      const pinned = new RegExp(`${name}: 'false'`).test(config)
      expect(keys.has(name) || pinned, `${name} is read by the app but not set in playwright.config.ts`).toBe(true)
    }
  })

  test('the profiles are built from FLAG_KEYS', () => {
    expect(keys.size).toBeGreaterThan(0)
    expect(config).toMatch(/all: flagsOn\(FLAG_KEYS\)/)
    expect(config).toMatch(/off: flagsOn\(\[\]\)/)
  })
})
