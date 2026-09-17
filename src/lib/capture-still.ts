export type StudioCanvasProbe = {
  width: number
  height: number
  offsetWidth: number
  offsetHeight: number
  isConnected: boolean
  hidden?: boolean
  className?: string
  parentElement: StudioCanvasProbe | null
  ownerDocument?: {
    defaultView?: {
      getComputedStyle: (element: StudioCanvasProbe) => {
        display: string
        visibility: string
      }
    } | null
  } | null
}

export function shouldEnterLook({
  thumbnailDataUrl,
}: {
  thumbnailDataUrl: string
}) {
  return thumbnailDataUrl.length > 0
}

export function lumaSpread({
  pixels,
}: {
  pixels: ArrayLike<number>
}) {
  let min = 255
  let max = 0

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const luma =
      (pixels[index] ?? 0) * 0.3 +
      (pixels[index + 1] ?? 0) * 0.59 +
      (pixels[index + 2] ?? 0) * 0.11
    min = Math.min(min, luma)
    max = Math.max(max, luma)
  }

  return max - min
}

export function canvasHasSceneFromPixels({
  pixels,
}: {
  pixels: ArrayLike<number>
}) {
  return lumaSpread({ pixels }) > 8
}

export function isLiveStudioCanvas({
  canvas,
}: {
  canvas: StudioCanvasProbe | HTMLCanvasElement | null
}) {
  if (!canvas) {
    return false
  }

  if (canvas.width < 2 || canvas.height < 2) {
    return false
  }

  if (canvas.offsetWidth < 2 || canvas.offsetHeight < 2) {
    return false
  }

  if (!canvas.isConnected) {
    return false
  }

  let node: StudioCanvasProbe | HTMLElement | null = canvas

  while (node) {
    if ('hidden' in node && node.hidden) {
      return false
    }

    if (
      typeof node.className === 'string' &&
      node.className.split(/\s+/).includes('hidden')
    ) {
      return false
    }

    const view = node.ownerDocument?.defaultView

    if (
      view &&
      typeof Element !== 'undefined' &&
      node instanceof Element
    ) {
      const style = (
        view as Window
      ).getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false
      }
    }

    node = node.parentElement as StudioCanvasProbe | HTMLElement | null
  }

  return true
}

function canvasHasScene({
  canvas,
}: {
  canvas: HTMLCanvasElement
}) {
  if (typeof document === 'undefined') {
    return false
  }

  try {
    const probe = document.createElement('canvas')
    probe.width = 48
    probe.height = 48
    const context = probe.getContext('2d')

    if (!context) {
      return false
    }

    context.drawImage(canvas, 0, 0, 48, 48)
    return canvasHasSceneFromPixels({
      pixels: context.getImageData(0, 0, 48, 48).data,
    })
  } catch {
    return false
  }
}

export async function captureFramedStill({
  canvas,
  type = 'image/jpeg',
}: {
  canvas: HTMLCanvasElement | null
  type?: 'image/jpeg' | 'image/png'
}): Promise<string> {
  if (!canvas || !isLiveStudioCanvas({ canvas })) {
    return ''
  }

  if (!canvasHasScene({ canvas })) {
    return ''
  }

  try {
    const source =
      type === 'image/png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.82)
    return await frameStill({ dataUrl: source, type })
  } catch {
    return ''
  }
}

export async function frameStill({
  dataUrl,
  type = 'image/jpeg',
}: {
  dataUrl: string
  type?: 'image/jpeg' | 'image/png'
}): Promise<string> {
  if (!dataUrl || typeof document === 'undefined') {
    return dataUrl
  }

  return new Promise((resolve) => {
    const image = new Image()

    image.onload = () => {
      const frame = document.createElement('canvas')
      const width = 480
      const height = 600
      frame.width = width
      frame.height = height

      const context = frame.getContext('2d')

      if (!context) {
        resolve('')
        return
      }

      context.fillStyle = '#1c1814'
      context.fillRect(0, 0, width, height)

      const sourceRatio = image.width / Math.max(1, image.height)
      const targetRatio = width / height
      let drawWidth = width
      let drawHeight = height
      let drawX = 0
      let drawY = 0

      if (sourceRatio > targetRatio) {
        drawHeight = height
        drawWidth = height * sourceRatio
        drawX = (width - drawWidth) / 2
      } else {
        drawWidth = width
        drawHeight = width / sourceRatio
        drawY = (height - drawHeight) / 2
      }

      context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
      resolve(
        type === 'image/png'
          ? frame.toDataURL('image/png')
          : frame.toDataURL('image/jpeg', 0.72),
      )
    }

    image.onerror = () => {
      resolve('')
    }

    image.src = dataUrl
  })
}
