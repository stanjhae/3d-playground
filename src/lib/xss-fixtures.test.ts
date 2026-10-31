import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

import { CloudTitle } from '../components/editor/CloudTitle'
import { DesignCard } from '../components/studio/DesignCard'
import { shareCardHtml } from './og-card'

/**
 * Stored strings that look like markup render as text (Q02 #187): titles,
 * public names and words are user input on every surface that shows them.
 * The public page and the words on the canvas are covered in
 * e2e/security.spec.ts, where they render in a real browser.
 */

const editor = vi.hoisted(() => ({ cloud: null as { designId: string; headSeq: number; title: string } | null }))

vi.mock('./editor-store', () => ({
  useEditorStore: (select: (state: unknown) => unknown) => select({ cloud: editor.cloud, setCloudTitle: () => {} }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
}))

const FIXTURES = [
  '<img src=x onerror="window.__xss=1">',
  '<script>window.__xss=1</script>',
  '"><svg onload=alert(1)>',
  "'><iframe src=javascript:alert(1)>",
]

/** The fixture appears only escaped: no tag of its own, no raw quote to break out with. */
function expectInert({ html, fixture }: { html: string; fixture: string }) {
  expect(html).not.toMatch(/<(img|script|svg|iframe)\b/i)
  expect(html).not.toContain(fixture)
}

describe('OG share page', () => {
  test.each(FIXTURES)('title and public name %s stay text', (fixture) => {
    const html = shareCardHtml({
      origin: 'https://house.test',
      shared: {
        slug: '0123456789abcdef',
        title: fixture,
        displayName: fixture,
        imageUrl: 'https://house.test/api/flp/public/0123456789abcdef/image',
        imageType: 'image/jpeg',
      },
    })

    expectInert({ html, fixture })
    expect(html).toContain('&lt;')
  })
})

describe('editor title', () => {
  test.each(FIXTURES)('%s is the input value, not markup', (fixture) => {
    editor.cloud = { designId: crypto.randomUUID(), headSeq: 1, title: fixture }
    const html = renderToStaticMarkup(createElement(CloudTitle))

    expectInert({ html, fixture })
    expect(html).toContain('value="')
  })
})

describe('My Studio card', () => {
  test.each(FIXTURES)('%s shows as the card title', (fixture) => {
    const html = renderToStaticMarkup(
      createElement(DesignCard, {
        design: {
          id: crypto.randomUUID(),
          title: fixture,
          visibility: 'published',
          headSeq: 1,
          updatedAt: '2026-10-31T12:00:00.000Z',
        },
        ownerId: crypto.randomUUID(),
        onRenamed: () => {},
        onDeleted: () => {},
      }),
    )

    expectInert({ html, fixture })
    expect(html).toContain('&lt;')
  })
})
