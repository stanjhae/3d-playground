import { describe, expect, test } from 'vitest'

import { GET as getOg } from '../../api/og'
import { GET as getOgPage } from '../../api/og-page'
import {
  escapeXml,
  lookCardHtml,
  ogDefaultRelativePath,
  ogStillRelativePath,
} from './og-card'

describe('escapeXml', () => {
  test('escapes markup in a look title', () => {
    expect(escapeXml({ value: 'Silk & <lace> "01"' })).toBe(
      'Silk &amp; &lt;lace&gt; &quot;01&quot;',
    )
  })
})

describe('og paths', () => {
  test('uses a house still when the look has one', () => {
    expect(ogStillRelativePath({ lookId: 'look-midnight-silk' })).toBe(
      'public/stills/look-midnight-silk.png',
    )
  })

  test('ignores a look id that cannot be a file name', () => {
    expect(ogStillRelativePath({ lookId: '../secret' })).toBeNull()
    expect(ogDefaultRelativePath()).toBe('public/og-default.png')
  })
})

describe('lookCardHtml', () => {
  test('writes a PNG card for crawlers', () => {
    const html = lookCardHtml({
      title: 'Midnight Silk & Co',
      author: 'Elise',
      imageUrl: 'https://house.test/api/og?lookId=look-midnight-silk',
      pageUrl: 'https://house.test/look/look-midnight-silk',
    })

    expect(html).toContain('Midnight Silk &amp; Co')
    expect(html).toContain('og:image:type" content="image/png"')
    expect(html).toContain('/api/og?lookId=look-midnight-silk')
  })
})

describe('og HTTP', () => {
  test('serves a PNG card', async () => {
    const response = await getOg(
      new Request('http://localhost/api/og?lookId=look-atelier-ivory'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(80)
  })

  test('serves a look card page', async () => {
    const response = await getOgPage(
      new Request('http://localhost/api/og-page?id=look-midnight-silk'),
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/html')
    expect(html).toContain('Midnight Silk Column')
    expect(html).toContain('image/png')
  })
})
