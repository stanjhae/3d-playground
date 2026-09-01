export async function captureFramedStill({
  canvas,
  type = 'image/jpeg',
}: {
  canvas: HTMLCanvasElement | null
  type?: 'image/jpeg' | 'image/png'
}): Promise<string> {
  if (!canvas) {
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
