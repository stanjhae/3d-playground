import { describe, expect, test } from 'vitest'

import {
  ERROR_REPORT_LIMITS,
  parseDsn,
  parseErrorReport,
  parseStack,
  scrubRoute,
  scrubText,
  sentryEnvelope,
} from './error-report'
import { createErrorReporter, isIgnorable } from './error-reporter'

/** Error reports (O1): what may leave the site. */

describe('scrubText', () => {
  test('removes emails, tokens, keys, ids and query strings', () => {
    const text = scrubText({
      text:
        'Failed for ana@example.com with Bearer abc.def eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlMTIz ' +
        'sb_secret_AbC123 design 0b6f2f6e-3a9f-4c1d-9a0e-2f7c1b5d8e4a at https://beta.example/s/x?code=123456#t',
    })

    expect(text).not.toMatch(/ana@|abc\.def|eyJ|AbC123|0b6f2f6e|code=|#t/)
    expect(text).toContain('[email]')
    expect(text).toContain('Bearer [token]')
    expect(text).toContain('https://beta.example/s/x')
  })
})

describe('scrubRoute', () => {
  test.each([
    ['/s/summer-tee-7kq2', '/s/:slug'],
    ['/look/look-midnight-silk', '/look/:lookId'],
    ['/api/flp/designs/0b6f2f6e-3a9f-4c1d-9a0e-2f7c1b5d8e4a/versions', '/api/flp/designs/:id/versions'],
    ['/create?design=abc#x', '/create'],
    ['/studio', '/studio'],
  ])('%s → %s', (path, expected) => {
    expect(scrubRoute({ path })).toBe(expected)
  })
})

describe('parseErrorReport', () => {
  const valid = { source: 'browser', type: 'TypeError', message: 'x is undefined', mechanism: 'window-error' }

  test('keeps only the known fields, scrubbed and trimmed', () => {
    const report = parseErrorReport({
      body: { ...valid, message: `mail me@example.com ${'a'.repeat(900)}`, route: '/s/abc', user: 'ana', cookie: 'x' },
    })

    expect(report).not.toBeNull()
    expect(Object.keys(report ?? {}).sort()).toEqual(['mechanism', 'message', 'route', 'source', 'stack', 'type'])
    expect(report?.message).not.toContain('me@example.com')
    expect(report?.message.length).toBe(ERROR_REPORT_LIMITS.message)
    expect(report?.route).toBe('/s/:slug')
  })

  test.each([null, [], 'x', { ...valid, source: 'server' }, { ...valid, message: '' }, { ...valid, type: 3 }])(
    'refuses %j',
    (body) => {
      expect(parseErrorReport({ body })).toBeNull()
    },
  )
})

describe('parseDsn', () => {
  test('finds the envelope endpoint', () => {
    expect(parseDsn({ dsn: 'https://pub123@o42.ingest.de.sentry.io/4507' })).toEqual({
      dsn: 'https://pub123@o42.ingest.de.sentry.io/4507',
      publicKey: 'pub123',
      envelopeUrl: 'https://o42.ingest.de.sentry.io/api/4507/envelope/',
    })
  })

  test.each([undefined, '', 'not a url', 'http://k@host/1', 'https://host/1', 'https://k@host/abc'])('refuses %j', (dsn) => {
    expect(parseDsn({ dsn })).toBeNull()
  })
})

describe('parseStack', () => {
  test('reads V8 and Firefox frames, oldest first', () => {
    const v8 = 'TypeError: x\n    at draw (https://beta.example/assets/index-abc.js:1:200)\n    at https://beta.example/assets/vendor.js:2:3'
    expect(parseStack({ stack: v8 })).toEqual([
      { function: '?', filename: 'https://beta.example/assets/vendor.js', lineno: 2, colno: 3, in_app: true },
      { function: 'draw', filename: 'https://beta.example/assets/index-abc.js', lineno: 1, colno: 200, in_app: true },
    ])
    expect(parseStack({ stack: 'draw@https://beta.example/a.js:4:5' })).toEqual([
      { function: 'draw', filename: 'https://beta.example/a.js', lineno: 4, colno: 5, in_app: true },
    ])
  })
})

describe('sentryEnvelope', () => {
  test('sends no user, IP or request data', () => {
    const dsn = parseDsn({ dsn: 'https://pub@o1.ingest.sentry.io/1' })!
    const lines = sentryEnvelope({
      report: { source: 'api', type: 'Error', message: 'boom', mechanism: 'api', route: '/api/flp' },
      dsn,
      release: 'abc123',
      environment: 'preview',
      eventId: 'e'.repeat(32),
      now: new Date('2026-11-10T00:00:00Z'),
    }).split('\n')

    expect(lines).toHaveLength(3)
    const event = JSON.parse(lines[2])
    expect(event.user).toEqual({ ip_address: null })
    expect(event.request).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.release).toBe('abc123')
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'boom' })
  })
})

describe('createErrorReporter', () => {
  test('reports each distinct error once, up to the page limit', () => {
    const sent: unknown[] = []
    const report = createErrorReporter({ send: (r) => sent.push(r), path: () => '/s/my-look', max: 2 })
    const error = new TypeError('a')

    report({ error, mechanism: 'window-error' })
    report({ error, mechanism: 'window-error' })
    report({ error: new Error('b'), mechanism: 'react-boundary' })
    report({ error: new Error('c'), mechanism: 'react-boundary' })

    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ source: 'browser', type: 'TypeError', message: 'a', route: '/s/:slug' })
  })

  test('skips browser noise', () => {
    expect(isIgnorable({ error: undefined, message: 'Script error.' })).toBe(true)
    expect(isIgnorable({ error: undefined, message: 'ResizeObserver loop limit exceeded' })).toBe(true)
    expect(isIgnorable({ error: new DOMException('stop', 'AbortError'), message: 'stop' })).toBe(true)
    expect(isIgnorable({ error: new Error('real'), message: 'real' })).toBe(false)
  })
})
