/** Where the site lives when nothing else says so. */
export const FALLBACK_SITE_ORIGIN = 'https://beta.fashionleadervote.com'

/**
 * The canonical origin for the landing's canonical URL, social cards,
 * robots.txt and sitemap. `VITE_SITE_ORIGIN` wins, then Vercel's production
 * domain, then the beta domain.
 */
export function siteOrigin({ env }: { env: Record<string, string | undefined> }) {
  const explicit = env.VITE_SITE_ORIGIN?.trim()

  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()

  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
  }

  return FALLBACK_SITE_ORIGIN
}

/** Only a production deployment (or a local build) may be indexed. */
export function siteIndexable({ env }: { env: Record<string, string | undefined> }) {
  return !env.VERCEL_ENV || env.VERCEL_ENV === 'production'
}

export function robotsTxt({ origin, indexable }: { origin: string; indexable: boolean }) {
  if (!indexable) {
    return 'User-agent: *\nDisallow: /\n'
  }

  // `/s/` stays crawlable so search engines can read its noindex.
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /create',
    'Disallow: /studio',
    'Disallow: /sign-in',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

export const SITEMAP_PATHS = ['/', '/privacy', '/terms'] as const

export function sitemapXml({ origin }: { origin: string }) {
  const urls = SITEMAP_PATHS.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
