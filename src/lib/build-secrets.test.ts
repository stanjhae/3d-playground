import { loadEnv } from 'vite'
import { describe, expect, test } from 'vitest'

/**
 * No server-only key reaches the browser (Q03 #188). Scans the built
 * `dist/` JavaScript, so it runs after `pnpm build` (CI builds first);
 * without a build it is skipped locally and fails in CI.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined>; cwd?: () => string } }).process ?? {}
const root = processEnv.cwd?.() ?? '.'
// Read as text at collection time; empty when there is no build.
const files = import.meta.glob<string>(['../../dist/**/*.js', '../../dist/**/*.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const built = Object.keys(files).length > 0

/** Payload of every JWT-shaped string, decoded where possible. */
function jwtRoles(text: string) {
  return [...text.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)].map((match) => {
    try {
      return (JSON.parse(atob(match[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role
    } catch {
      return undefined
    }
  })
}

describe('built bundle', () => {
  test.runIf(!built && processEnv.env?.CI)('exists in CI', () => {
    expect(built, 'run `pnpm build` before `pnpm test`').toBe(true)
  })

  describe.runIf(built)('contains no server secret', () => {
    const secret = { ...loadEnv('production', root, 'SUPABASE_'), ...processEnv.env }.SUPABASE_SECRET_KEY

    test('has JavaScript to scan', () => {
      expect(Object.keys(files).some((file) => file.endsWith('.js'))).toBe(true)
    })

    test.each(Object.entries(files).map(([file, text]) => [file.replace('../../dist/', ''), text]))('%s', (_, text) => {
      expect(text).not.toContain('service_role')
      expect(text).not.toMatch(/sb_secret_[\w-]{8,}/)
      expect(jwtRoles(text)).not.toContain('service_role')

      if (secret) {
        expect(text.includes(secret), 'SUPABASE_SECRET_KEY value is in the bundle').toBe(false)
      }
    })
  })
})
