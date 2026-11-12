import { describe, expect, it } from 'vitest'

import { HERO_INKS, INK_SWATCH_CLASS } from '../components/landing/HeroToolDock'
import { LANDING_LINKS } from '../components/site/LandingHeader'
import { renderLanding } from '../prerender/landing'
import { findForbiddenClaim } from './claims-patterns'
import { heroSceneTrigger } from './hero-scene-gate'
import { injectBeforeRoot, replaceSiteHead } from './html-shell'
import { allLandingStrings, LANDING_COPY, LANDING_SEO } from './landing-copy'
import { landingHead, landingJsonLd } from './landing-seo'
import { pageTitle, routeLabel } from './page-title'
import { robotsTxt, siteIndexable, siteOrigin, sitemapXml } from './site-origin'

const ORIGIN = 'https://flv.example'

describe('landing copy', () => {
  it('makes no claim the alpha cannot back', () => {
    for (const text of allLandingStrings()) {
      expect(findForbiddenClaim({ text }), text).toBeNull()
      // R4: no "realistic"; no pricing or printing promises.
      expect(text).not.toMatch(/\brealistic\b|\bfree\b|\bprint-ready\b/i)
    }
  })

  it('keeps the search title and the tab title the same', () => {
    expect(pageTitle({ label: routeLabel({ pathname: '/' }) })).toBe(LANDING_SEO.title)
    expect(LANDING_SEO.description.length).toBeLessThanOrEqual(160)
  })
})

describe('landing SEO', () => {
  it('builds JSON-LD whose FAQ is exactly the page’s FAQ', () => {
    const graph = landingJsonLd({ origin: ORIGIN })['@graph']
    const faq = graph.find((node) => node['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }

    expect(faq.mainEntity.map((entry) => [entry.name, entry.acceptedAnswer.text])).toEqual(
      LANDING_COPY.faq.items.map((item) => [item.question, item.answer]),
    )
  })

  it('uses absolute URLs and keeps the JSON-LD block safe to embed', () => {
    const head = landingHead({ origin: ORIGIN })

    expect(head).toContain(`<link rel="canonical" href="${ORIGIN}/" />`)
    expect(head).toContain(`<meta property="og:image" content="${ORIGIN}/og-default.png" />`)
    const json = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!
    expect(json).not.toContain('<')
    expect(() => JSON.parse(json)).not.toThrow()
  })
})

describe('site origin, robots and sitemap', () => {
  it('prefers the explicit origin, then Vercel’s production domain', () => {
    expect(siteOrigin({ env: { VITE_SITE_ORIGIN: 'https://a.example/' } })).toBe('https://a.example')
    expect(siteOrigin({ env: { VERCEL_PROJECT_PRODUCTION_URL: 'b.example' } })).toBe('https://b.example')
    expect(siteOrigin({ env: {} })).toBe('https://beta.fashionleadervote.com')
  })

  it('lets only production be indexed, and keeps the studio out', () => {
    expect(siteIndexable({ env: { VERCEL_ENV: 'preview' } })).toBe(false)
    expect(siteIndexable({ env: { VERCEL_ENV: 'production' } })).toBe(true)
    expect(robotsTxt({ origin: ORIGIN, indexable: false })).toBe('User-agent: *\nDisallow: /\n')
    const robots = robotsTxt({ origin: ORIGIN, indexable: true })
    expect(robots).toContain('Disallow: /studio')
    // Shared pages stay crawlable so their noindex can be read.
    expect(robots).not.toContain('Disallow: /s/')
    expect(sitemapXml({ origin: ORIGIN })).toContain(`<loc>${ORIGIN}/</loc>`)
  })
})

describe('hero scene gate', () => {
  const base = { webgl: true, finePointer: true, wide: true, saveData: false, slowNetwork: false }

  it('loads 3D at idle on a desktop, on touch elsewhere, and never without WebGL', () => {
    expect(heroSceneTrigger(base)).toBe('idle')
    expect(heroSceneTrigger({ ...base, finePointer: false })).toBe('interaction')
    expect(heroSceneTrigger({ ...base, wide: false })).toBe('interaction')
    expect(heroSceneTrigger({ ...base, saveData: true })).toBe('interaction')
    expect(heroSceneTrigger({ ...base, slowNetwork: true })).toBe('interaction')
    expect(heroSceneTrigger({ ...base, webgl: false })).toBe('never')
  })
})

describe('hero dock inks', () => {
  it('paints each swatch in the ink it applies', () => {
    expect(HERO_INKS.length).toBe(Object.keys(INK_SWATCH_CLASS).length)

    for (const color of HERO_INKS) {
      expect(INK_SWATCH_CLASS[color.id]?.toLowerCase()).toBe(`bg-[${color.value.toLowerCase()}]`)
    }
  })
})

describe('html shell', () => {
  const shell = '<html><head><title>Old</title><meta name="description" content="x" /><meta property="og:title" content="x" /></head><body><div id="root"></div></body></html>'

  it('swaps the site head and places markup before the root', () => {
    const html = injectBeforeRoot({ shell: replaceSiteHead({ shell, head: '<title>New</title>' }), html: '<p>hi</p>' })

    expect(html).toContain('<title>New</title>')
    expect(html).not.toContain('Old')
    expect(html).not.toContain('og:title')
    expect(html).toContain('<p>hi</p><div id="root"></div>')
  })

  it('refuses a shell without an empty root', () => {
    expect(() => injectBeforeRoot({ shell: '<div id="root">x</div>', html: '' })).toThrow()
  })
})

describe('prerendered landing', () => {
  const { body } = renderLanding({ origin: ORIGIN })

  it('has the whole page as real HTML, with one h1', () => {
    expect(body.match(/<h1\b/g)).toHaveLength(1)

    for (const id of ['product', 'flow', 'features', 'vote', 'alpha', 'faq', 'waitlist']) {
      expect(body).toContain(`id="${id}"`)
    }

    for (const item of LANDING_COPY.faq.items) {
      expect(body).toContain(item.question.replace(/’/g, '’'))
    }
  })

  it('gives every header link a section to land on', () => {
    for (const link of LANDING_LINKS) {
      expect(body).toContain(`id="${link.href.slice(1)}"`)
    }
  })

  it('works under the CSP and without scripts', () => {
    expect(body).not.toMatch(/\sstyle="/)
    expect(body).not.toMatch(/<canvas\b/)
    expect(body).not.toContain('/stills/')
    expect(body).toContain('href="/studio"')
  })

  it('badges every concept', () => {
    const concepts = body.split('data-claim="concept"').slice(1)
    expect(concepts.length).toBeGreaterThan(0)

    for (const after of concepts) {
      expect(after.slice(0, 4000)).toMatch(/Concept Preview/i)
    }
  })
})
