import {
  imageFromDataUrl,
  isSafeStillPath,
  isSafeThumbnail,
  stillImageType,
} from './look-thumbnail'

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

export function lookShareImage({
  origin,
  lookId,
  thumbnailDataUrl,
}: {
  origin: string
  lookId: string
  thumbnailDataUrl?: string
}) {
  const still = thumbnailDataUrl ?? ''

  if (
    still &&
    isSafeThumbnail({ thumbnailDataUrl: still }) &&
    isSafeStillPath({ thumbnailDataUrl: still })
  ) {
    return {
      imageUrl: `${origin}${still}`,
      imageType: stillImageType({ thumbnailDataUrl: still }),
    }
  }

  const decoded = still.startsWith('data:')
    ? imageFromDataUrl({ dataUrl: still })
    : null

  return {
    imageUrl: `${origin}/api/og?lookId=${encodeURIComponent(lookId)}`,
    imageType: decoded?.type ?? 'image/png',
  }
}

export function lookCardHtml({
  title,
  author,
  description,
  imageUrl,
  imageType = 'image/png',
  pageUrl,
}: {
  title: string
  author: string
  description?: string
  imageUrl: string
  imageType?: string
  pageUrl: string
}) {
  const safeTitle = escapeXml({
    value: title.slice(0, 80) || 'Fashion Leader Vote',
  })
  const safeDescription = escapeXml({
    value:
      (description ?? '').slice(0, 160) ||
      (author ? `By ${author.slice(0, 40)}` : 'The house is open.'),
  })
  const safeImage = escapeXml({ value: imageUrl })
  const safePage = escapeXml({ value: pageUrl })

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle} — Fashion Leader Vote</title>
    <meta name="description" content="${safeDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:type" content="${escapeXml({ value: imageType })}" />
    <meta property="og:url" content="${safePage}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImage}" />
  </head>
  <body>
    <p>Opening the look.</p>
  </body>
</html>`
}
