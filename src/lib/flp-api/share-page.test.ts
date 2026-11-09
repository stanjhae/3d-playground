import { describe, expect, test } from 'vitest'

import { shareCardHead } from '../og-card'
import { takeEmbeddedPublicDesign } from '../public-embed'
import { PUBLIC_PAYLOAD_ELEMENT_ID, SLEEVE_GRID_CLASS, injectShareHead } from './share-page'
import type { PublicDesign } from './publication'

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Fashion Leader Vote</title>
    <meta
      name="description"
      content="Design a look."
    />
    <meta property="og:title" content="Fashion Leader Vote" />
    <meta name="twitter:image" content="/og-default.png" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`

const PAYLOAD: PublicDesign = {
  slug: '3f9a1c22b7e04d11',
  title: '</script><script>alert(1)</script>',
  displayName: 'Ada & co',
  seq: 4,
  publishedAt: '2026-10-31T10:00:00.000Z',
  renders: {
    view_front: '/api/flp/public/3f9a1c22b7e04d11/image?seq=4',
    view_three_quarter: '/api/flp/public/3f9a1c22b7e04d11/image?view=view_three_quarter&seq=4',
    view_back: '/api/flp/public/3f9a1c22b7e04d11/image?view=view_back&seq=4',
  },
}

const WITH_SLEEVES: PublicDesign = {
  ...PAYLOAD,
  renders: {
    ...PAYLOAD.renders,
    view_left: '/api/flp/public/3f9a1c22b7e04d11/image?view=view_left&seq=4',
    view_right: '/api/flp/public/3f9a1c22b7e04d11/image?view=view_right&seq=4',
  },
}

function headFor(payload: PublicDesign | null) {
  return shareCardHead({
    origin: 'https://house.test',
    shared: payload
      ? { slug: payload.slug, title: payload.title, displayName: payload.displayName, imageUrl: 'https://house.test/x', imageType: 'image/jpeg' }
      : null,
  })
}

describe('share page head (#182, #184)', () => {
  test('replaces the site tags, preloads the front view and embeds only public fields', () => {
    const html = injectShareHead({ shell: SHELL, head: headFor(PAYLOAD), payload: PAYLOAD })

    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).not.toContain('content="Design a look."')
    expect(html).not.toContain('content="Fashion Leader Vote"')
    expect(html).toContain('<link rel="preload" as="image" href="/api/flp/public/3f9a1c22b7e04d11/image?seq=4"')
    expect(html).toContain('src="/assets/index-abc.js"')
    expect(html.indexOf(`id="${PUBLIC_PAYLOAD_ELEMENT_ID}"`)).toBeLessThan(html.indexOf('</head>'))
  })

  test('a title cannot close the data block or inject markup', () => {
    const html = injectShareHead({ shell: SHELL, head: headFor(PAYLOAD), payload: PAYLOAD })
    const block = html.slice(html.indexOf(`id="${PUBLIC_PAYLOAD_ELEMENT_ID}">`))

    expect(block.slice(0, block.indexOf('</script>'))).not.toMatch(/<\/?script/i)
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  test('the embedded payload round-trips for its own slug only', () => {
    const html = injectShareHead({ shell: SHELL, head: headFor(PAYLOAD), payload: PAYLOAD })
    const json = html.slice(html.indexOf('>', html.indexOf(`id="${PUBLIC_PAYLOAD_ELEMENT_ID}"`)) + 1, html.indexOf('</script>', html.indexOf(`id="${PUBLIC_PAYLOAD_ELEMENT_ID}"`)))
    const doc = { getElementById: () => ({ textContent: json, remove() {} }) as unknown as HTMLElement }

    expect(takeEmbeddedPublicDesign({ slug: PAYLOAD.slug, doc })).toEqual(PAYLOAD)
    expect(takeEmbeddedPublicDesign({ slug: 'ffffffffffffffff', doc })).toBeNull()
  })

  test('an unknown design gets the site card and no payload', () => {
    const html = injectShareHead({ shell: SHELL, head: headFor(null), payload: null })

    expect(html).not.toContain(PUBLIC_PAYLOAD_ELEMENT_ID)
    expect(html).not.toContain('rel="preload"')
    expect(html).toContain('og:image" content="https://house.test/og-default.png"')
  })

  test('a published design drops the JS preloads so the first image is not queued behind them', () => {
    const shell = SHELL.replace(
      '</head>',
      '<link rel="modulepreload" crossorigin href="/assets/a.js">\n    <link rel="modulepreload" crossorigin href="/assets/b.js">\n  </head>',
    )

    const html = injectShareHead({ shell, head: headFor(PAYLOAD), payload: PAYLOAD })

    expect(html).not.toContain('modulepreload')
    expect(html).toContain('src="/assets/index-abc.js"')
    expect(html).toContain('rel="preload" as="image"')
  })

  test('an unknown design keeps the JS preloads, since it has no image to put first', () => {
    const shell = SHELL.replace('</head>', '<link rel="modulepreload" crossorigin href="/assets/a.js">\n  </head>')

    expect(injectShareHead({ shell, head: headFor(null), payload: null })).toContain('modulepreload')
  })

  test('the views are in the HTML before the app loads, escaped', () => {
    const shell = SHELL.replace('<body><div id="root"></div></body>', '<body><div id="root"></div></body>')
    const html = injectShareHead({ shell, head: headFor(PAYLOAD), payload: PAYLOAD })
    const root = html.slice(html.indexOf('<div id="flp-static-share"'), html.indexOf('<div id="root">'))

    expect(root.match(/<img /g)).toHaveLength(3)
    expect(root).toContain(`src="${PAYLOAD.renders.view_front}"`)
    expect(root).toContain('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(root).not.toContain('<script')
    expect(root).toContain('By Ada &amp; co · version 4')
    expect(html).toContain('<div id="root"></div>')
  })

  test('a three-view publication (before #179) shows no sleeve row', () => {
    const html = injectShareHead({ shell: SHELL, head: headFor(PAYLOAD), payload: PAYLOAD })

    expect(html).not.toContain(SLEEVE_GRID_CLASS)
    expect(html).not.toContain("Wearer&#39;s")
  })

  test('sleeve views sit under the main three, labelled by the wearer\'s side; the preload stays on the front', () => {
    const html = injectShareHead({ shell: SHELL, head: headFor(WITH_SLEEVES), payload: WITH_SLEEVES })
    const root = html.slice(html.indexOf('<div id="flp-static-share"'), html.indexOf('<div id="root">'))
    const sleeveRow = root.slice(root.indexOf(SLEEVE_GRID_CLASS))

    expect(root.match(/<img /g)).toHaveLength(5)
    expect(root.indexOf('view=view_back')).toBeGreaterThan(0)
    expect(root.indexOf('view=view_back')).toBeLessThan(root.indexOf(SLEEVE_GRID_CLASS))
    expect(sleeveRow.indexOf('view=view_left')).toBeGreaterThan(0)
    expect(sleeveRow.indexOf('view=view_left')).toBeLessThan(sleeveRow.indexOf('view=view_right'))
    expect(sleeveRow).toContain('Wearer&#39;s right</span>')
    expect(sleeveRow).toContain('Wearer&#39;s left</span>')
    expect(html.match(/rel="preload"/g)).toHaveLength(1)
    expect(html).toContain(`<link rel="preload" as="image" href="${WITH_SLEEVES.renders.view_front}"`)
  })

  test('a payload with sleeves round-trips; one with a malformed sleeve does not', () => {
    const docFor = (value: unknown) => ({
      getElementById: () => ({ textContent: JSON.stringify(value), remove() {} }) as unknown as HTMLElement,
    })

    expect(takeEmbeddedPublicDesign({ slug: PAYLOAD.slug, doc: docFor(WITH_SLEEVES) })).toEqual(WITH_SLEEVES)
    expect(
      takeEmbeddedPublicDesign({
        slug: PAYLOAD.slug,
        doc: docFor({ ...WITH_SLEEVES, renders: { ...WITH_SLEEVES.renders, view_left: 7 } }),
      }),
    ).toBeNull()
  })
})
