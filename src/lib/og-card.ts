const LOOK_ID_PATTERN = /^[A-Za-z0-9-]+$/

export function escapeXml({ value }: { value: string }) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function ogStillRelativePath({
  lookId,
}: {
  lookId?: string | null
}) {
  if (!lookId || !LOOK_ID_PATTERN.test(lookId)) {
    return null
  }

  return `public/stills/${lookId}.png`
}

export function ogDefaultRelativePath() {
  return 'public/og-default.png'
}

export function lookCardHtml({
  title,
  author,
  imageUrl,
  pageUrl,
}: {
  title: string
  author: string
  imageUrl: string
  pageUrl: string
}) {
  const safeTitle = escapeXml({
    value: title.slice(0, 80) || 'Fashion Leader Vote',
  })
  const safeAuthor = escapeXml({
    value: author ? `By ${author.slice(0, 40)}` : 'The house is open.',
  })
  const safeImage = escapeXml({ value: imageUrl })
  const safePage = escapeXml({ value: pageUrl })

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle} — Fashion Leader Vote</title>
    <meta name="description" content="Design a look. Enter the vote. Name a Leader." />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeAuthor}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:url" content="${safePage}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeAuthor}" />
    <meta name="twitter:image" content="${safeImage}" />
  </head>
  <body>
    <p>Opening the look.</p>
  </body>
</html>`
}
