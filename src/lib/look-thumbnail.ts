export const MAX_THUMBNAIL_CHARS = 180_000

const SAFE_DATA_IMAGE = /^data:image\/(?:jpeg|jpg|png|webp|gif);/i
const SAFE_STILL_PATH = /^\/stills\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif)$/i

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
    SAFE_STILL_PATH.test(thumbnailDataUrl)
  )
}

export function sanitizeThumbnail({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  return isSafeThumbnail({ thumbnailDataUrl }) ? thumbnailDataUrl : ''
}
