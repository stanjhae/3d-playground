export const MAX_THUMBNAIL_CHARS = 180_000

const SAFE_DATA_IMAGE = /^data:image\/(?:jpeg|jpg|png|webp|gif);/i
const SAFE_STILL_PATH = /^\/stills\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif)$/i
const SAFE_DATA_MIME = /^data:(image\/(?:jpeg|jpg|png|webp|gif));/i

export function isSafeStillPath({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  return SAFE_STILL_PATH.test(thumbnailDataUrl)
}

export function isSafeThumbnail({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  if (!thumbnailDataUrl || thumbnailDataUrl.length > MAX_THUMBNAIL_CHARS) {
    return false
  }

  return (
    SAFE_DATA_IMAGE.test(thumbnailDataUrl) ||
    isSafeStillPath({ thumbnailDataUrl })
  )
}

export function stillImageType({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  if (
    thumbnailDataUrl.startsWith('data:image/jpeg') ||
    thumbnailDataUrl.startsWith('data:image/jpg') ||
    /\.jpe?g$/i.test(thumbnailDataUrl)
  ) {
    return 'image/jpeg'
  }

  if (
    thumbnailDataUrl.startsWith('data:image/webp') ||
    thumbnailDataUrl.endsWith('.webp')
  ) {
    return 'image/webp'
  }

  if (
    thumbnailDataUrl.startsWith('data:image/gif') ||
    thumbnailDataUrl.endsWith('.gif')
  ) {
    return 'image/gif'
  }

  return 'image/png'
}

export function imageFromDataUrl({ dataUrl }: { dataUrl: string }) {
  try {
    const comma = dataUrl.indexOf(',')

    if (comma < 0 || !dataUrl.slice(0, comma).includes('base64')) {
      return null
    }

    if (!isSafeThumbnail({ thumbnailDataUrl: dataUrl })) {
      return null
    }

    const mime = dataUrl.slice(0, comma).match(SAFE_DATA_MIME)?.[1]

    if (!mime) {
      return null
    }

    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

    return {
      bytes,
      type: mime === 'image/jpg' ? 'image/jpeg' : mime,
    }
  } catch {
    return null
  }
}

export function sanitizeThumbnail({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  return isSafeThumbnail({ thumbnailDataUrl }) ? thumbnailDataUrl : ''
}
