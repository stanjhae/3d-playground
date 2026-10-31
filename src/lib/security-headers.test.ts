import { describe, expect, test } from 'vitest'

import vercelConfig from '../../vercel.json' with { type: 'json' }
import {
  DEPLOYED_SUPABASE_SOURCE,
  contentSecurityPolicy,
  securityHeaders,
  supabaseMetaPolicy,
  supabaseOrigin,
  vercelHeaders,
} from './security-headers'

/** Security headers (Q02 #187). */

function directives({ policy }: { policy: string }) {
  return Object.fromEntries(
    policy.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/)
      return [name, sources]
    }),
  )
}

describe('vercel.json', () => {
  test('carries exactly the generated headers (run node scripts/security-headers.mjs)', () => {
    expect(vercelConfig.headers).toEqual(vercelHeaders())
  })
})

describe('contentSecurityPolicy', () => {
  const deployed = directives({ policy: contentSecurityPolicy({ supabase: DEPLOYED_SUPABASE_SOURCE }) })

  test('locks down framing, base, forms and plugins', () => {
    expect(deployed['default-src']).toEqual(["'self'"])
    expect(deployed['frame-ancestors']).toEqual(["'none'"])
    expect(deployed['base-uri']).toEqual(["'self'"])
    expect(deployed['form-action']).toEqual(["'self'"])
    expect(deployed['object-src']).toEqual(["'none'"])
  })

  test('never allows inline script, inline style or JS eval', () => {
    for (const sources of Object.values(deployed)) {
      expect(sources).not.toContain("'unsafe-inline'")
      expect(sources).not.toContain("'unsafe-eval'")
    }
  })

  test('Supabase is the only remote source, and only for calls and images', () => {
    const remote = Object.entries(deployed).filter(([, sources]) => sources.some((source) => source.includes('://')))
    expect(remote.map(([name]) => name).sort()).toEqual(['connect-src', 'img-src'])
    expect(deployed['connect-src']).toContain(DEPLOYED_SUPABASE_SOURCE)
  })

  test('the dev nonce only adds to script and style', () => {
    const dev = directives({ policy: contentSecurityPolicy({ supabase: 'http://127.0.0.1:54321', devNonce: 'abc' }) })
    expect(dev['script-src']).toContain("'nonce-abc'")
    expect(dev['style-src']).toContain("'nonce-abc'")
    expect(dev['frame-ancestors']).toEqual(["'none'"])
    expect(Object.values(dev).flat().filter((source) => source.includes('nonce'))).toHaveLength(2)
  })
})

describe('supabaseMetaPolicy', () => {
  test('narrows calls and images to the configured project', () => {
    const meta = directives({ policy: supabaseMetaPolicy({ supabase: 'https://abc.supabase.co' }) })
    expect(meta['connect-src']).toContain('https://abc.supabase.co')
    expect(meta['img-src']).toContain('https://abc.supabase.co')
    expect(JSON.stringify(meta)).not.toContain('*')
  })
})

describe('supabaseOrigin', () => {
  test('keeps only the origin', () => {
    expect(supabaseOrigin({ url: 'https://abc.supabase.co/rest/v1/' })).toBe('https://abc.supabase.co')
    expect(supabaseOrigin({ url: '' })).toBeNull()
    expect(supabaseOrigin({ url: 'not a url' })).toBeNull()
  })
})

describe('securityHeaders', () => {
  test('sets the companion headers', () => {
    const headers = securityHeaders({ supabase: null })
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers['Permissions-Policy']).toContain('microphone=()')
    expect(headers['Permissions-Policy']).toContain('geolocation=()')
  })
})
