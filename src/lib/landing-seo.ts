import { embeddedJson, escapeHtml } from './html-shell.ts'
import { LANDING_COPY, LANDING_SEO } from './landing-copy.ts'

export const OG_IMAGE_PATH = '/og-default.png'
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const
const BRAND = 'Fashion Leader Vote'

/**
 * One `@graph` for the landing: the site, the studio as a web app, and the
 * FAQ, which is built from the same items people read on the page.
 */
export function landingJsonLd({ origin }: { origin: string }) {
  const url = `${origin}/`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${url}#website`, name: BRAND, url },
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name: BRAND,
        url,
        description: LANDING_SEO.description,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and WebGL',
        image: `${origin}${OG_IMAGE_PATH}`,
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: LANDING_COPY.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  }
}

/** The landing's <head> additions: title, description, canonical, cards, JSON-LD. */
export function landingHead({ origin }: { origin: string }) {
  const url = `${origin}/`
  const image = `${origin}${OG_IMAGE_PATH}`
  const attr = (value: string) => escapeHtml({ value })

  return [
    `<title>${attr(LANDING_SEO.title)}</title>`,
    `<meta name="description" content="${attr(LANDING_SEO.description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(LANDING_SEO.title)}" />`,
    `<meta property="og:description" content="${attr(LANDING_SEO.description)}" />`,
    `<meta property="og:image" content="${attr(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_SIZE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_SIZE.height}" />`,
    `<meta property="og:image:alt" content="${attr(LANDING_SEO.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(LANDING_SEO.title)}" />`,
    `<meta name="twitter:description" content="${attr(LANDING_SEO.description)}" />`,
    `<meta name="twitter:image" content="${attr(image)}" />`,
    `<script type="application/ld+json">${embeddedJson({ value: landingJsonLd({ origin }) })}</script>`,
  ]
    .map((line) => `    ${line}`)
    .join('\n')
}
