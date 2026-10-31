import { describe, expect, test } from 'vitest'

import { GET as getOg } from '../../api/og'
import { GET as getOgPage } from '../../api/og-page'
import { handleSharePage } from './flp-api/share-page'
import { createStoredDesign, resetDesignsStore } from './designs-store'
import {
  escapeXml,
  lookCardHtml,
  lookShareImage,
  ogDefaultRelativePath,
  ogStillRelativePath,
  shareCardHtml,
} from './og-card'

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACq/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

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
    expect(html).toContain('Gown · Ink Cotton')
    expect(html).toContain('image/png')
  })

  test('serves a stored guest look, not only a seed', async () => {
    resetDesignsStore()
    const created = createStoredDesign({
      draft: {
        title: 'Guest Silk 01',
        author: 'Guest',
        thumbnailDataUrl: TINY_JPEG,
        overrides: [
          {
            meshName: 'body',
            color: '#f6e7d8',
            mapId: 'silk-shine',
          },
        ],
        garmentId: 'gown',
      },
    })

    const response = await getOgPage(
      new Request(`http://localhost/api/og-page?id=${created.id}`),
    )
    const html = await response.text()

    expect(html).toContain('Guest Silk 01')
    expect(html).toContain('Gown · Silk')
    expect(html).toContain(`lookId=${created.id}`)
    expect(html).toContain('og:image:type" content="image/jpeg"')
  })

  test('serves a guest still from the stored data url', async () => {
    resetDesignsStore()
    const created = createStoredDesign({
      draft: {
        title: 'Guest Silk 01',
        author: 'Guest',
        thumbnailDataUrl: TINY_JPEG,
        overrides: [
          {
            meshName: 'body',
            color: '#f6e7d8',
            mapId: 'silk-shine',
          },
        ],
        garmentId: 'gown',
      },
    })

    const response = await getOg(
      new Request(`http://localhost/api/og?lookId=${created.id}`),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(8)
  })

  test('falls back to the house card when a data url will not decode', async () => {
    resetDesignsStore()
    const created = createStoredDesign({
      draft: {
        title: 'Guest Silk 01',
        author: 'Guest',
        thumbnailDataUrl: 'data:image/jpeg;base64,!!!!',
        overrides: [
          {
            meshName: 'body',
            color: '#f6e7d8',
            mapId: 'silk-shine',
          },
        ],
        garmentId: 'gown',
      },
    })

    const page = await getOgPage(
      new Request(`http://localhost/api/og-page?id=${created.id}`),
    )
    const image = await getOg(
      new Request(`http://localhost/api/og?lookId=${created.id}`),
    )

    expect(await page.text()).toContain('og:image:type" content="image/png"')
    expect(image.status).toBe(200)
    expect(image.headers.get('Content-Type')).toBe('image/png')
  })
})

describe('lookShareImage', () => {
  test('uses the house still path as a png', () => {
    expect(
      lookShareImage({
        origin: 'https://house.test',
        lookId: 'look-midnight-silk',
        thumbnailDataUrl: '/stills/look-midnight-silk.png',
      }),
    ).toEqual({
      imageUrl: 'https://house.test/stills/look-midnight-silk.png',
      imageType: 'image/png',
    })
  })

  test('points a guest still at the image route as jpeg', () => {
    expect(
      lookShareImage({
        origin: 'https://house.test',
        lookId: 'look-guest',
        thumbnailDataUrl: TINY_JPEG,
      }),
    ).toEqual({
      imageUrl: 'https://house.test/api/og?lookId=look-guest',
      imageType: 'image/jpeg',
    })
  })
})

describe('shareCardHtml', () => {
  const shared = {
    slug: '0123456789abcdef',
    title: 'Tee "01" <script>alert(1)</script> & co',
    displayName: '<b>Ada</b> & "friends"',
    imageUrl: 'https://house.test/api/flp/public/0123456789abcdef/image',
    imageType: 'image/jpeg',
  }

  test('a published design shows its title, display name and our stable image', () => {
    const html = shareCardHtml({ origin: 'https://house.test', shared })

    expect(html).toContain('og:title" content="Tee &quot;01&quot; &lt;script&gt;alert(1)&lt;/script&gt; &amp; co"')
    expect(html).toContain('By &lt;b&gt;Ada&lt;/b&gt; &amp; &quot;friends&quot; on Fashion Leader Vote.')
    expect(html).toContain('og:image" content="https://house.test/api/flp/public/0123456789abcdef/image"')
    expect(html).toContain('twitter:image" content="https://house.test/api/flp/public/0123456789abcdef/image"')
    expect(html).toContain('og:image:type" content="image/jpeg"')
    expect(html).toContain('og:url" content="https://house.test/s/0123456789abcdef"')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
  })

  test('without a display name it does not invent an author', () => {
    const html = shareCardHtml({ origin: 'https://house.test', shared: { ...shared, title: 'Tee', displayName: null } })

    expect(html).toContain(
      'og:description" content="A design on Fashion Leader Vote. Creator-supplied preview, not a certified fit or manufacturing render."',
    )
    expect(html).not.toContain('By ')
  })

  test('an unknown or unpublished design gets the site card only', () => {
    const html = shareCardHtml({ origin: 'https://house.test', shared: null })

    expect(html).toContain('og:title" content="Fashion Leader Vote"')
    expect(html).toContain('og:image" content="https://house.test/og-default.png"')
    expect(html).toContain('og:url" content="https://house.test/"')
    expect(html).not.toContain('/api/flp/public/')
  })

  test('the share page never reflects the requested slug when nothing is published', async () => {
    const response = await handleSharePage({
      env: null,
      request: new Request('https://house.test/api/og-share?slug=%22%3E%3Cscript%3Ex%3C%2Fscript%3E'),
    })
    const html = await response.text()

    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('og:title" content="Fashion Leader Vote"')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('&lt;script')
  })
})
