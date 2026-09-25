import type { DesignDocument, DesignLayer, Stroke } from './design-document'
import { MAX_ART_MAP_CHARS, isSafeDataImage } from './look-thumbnail'
import {
  atlasPixelForUv,
  atlasSourceRect,
  DEFAULT_PANEL_UV,
  panelPointToUv,
} from './panel-uv'

export const ATLAS_SIZE = 512

export type AtlasBuffer = {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

function hexToRgb({ color }: { color: string }) {
  const hex = color.replace('#', '')
  const withAlpha = hex.length === 8
  const rgbHex =
    hex.length === 3
      ? hex
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : hex.padEnd(withAlpha ? 8 : 6, '0').slice(0, withAlpha ? 8 : 6)
  const value = Number.parseInt(
    withAlpha ? rgbHex.slice(0, 6) : rgbHex.slice(0, 6),
    16,
  )
  const alphaHex = withAlpha ? Number.parseInt(rgbHex.slice(6, 8), 16) : 255

  if (!Number.isFinite(value)) {
    return { r: 26, g: 28, b: 34, a: 255 }
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    a: Number.isFinite(alphaHex) ? alphaHex : 255,
  }
}

function writePixel({
  buffer,
  index,
  r,
  g,
  b,
  a,
  erase = false,
}: {
  buffer: AtlasBuffer
  index: number
  r: number
  g: number
  b: number
  a: number
  erase?: boolean
}) {
  if (index < 0 || index + 3 >= buffer.pixels.length) {
    return
  }

  if (erase) {
    buffer.pixels[index] = 0
    buffer.pixels[index + 1] = 0
    buffer.pixels[index + 2] = 0
    buffer.pixels[index + 3] = 0
    return
  }

  const destA = buffer.pixels[index + 3] ?? 0
  const srcA = a / 255
  const outA = srcA + (destA / 255) * (1 - srcA)

  if (outA <= 0) {
    buffer.pixels[index] = 0
    buffer.pixels[index + 1] = 0
    buffer.pixels[index + 2] = 0
    buffer.pixels[index + 3] = 0
    return
  }

  const destR = buffer.pixels[index] ?? 0
  const destG = buffer.pixels[index + 1] ?? 0
  const destB = buffer.pixels[index + 2] ?? 0

  buffer.pixels[index] = Math.round((r * srcA + destR * (destA / 255) * (1 - srcA)) / outA)
  buffer.pixels[index + 1] = Math.round(
    (g * srcA + destG * (destA / 255) * (1 - srcA)) / outA,
  )
  buffer.pixels[index + 2] = Math.round(
    (b * srcA + destB * (destA / 255) * (1 - srcA)) / outA,
  )
  buffer.pixels[index + 3] = Math.round(outA * 255)
}

function stampDot({
  buffer,
  u,
  v,
  radius,
  color,
  erase,
  opacity = 1,
}: {
  buffer: AtlasBuffer
  u: number
  v: number
  radius: number
  color: string
  erase: boolean
  opacity?: number
}) {
  const { r, g, b, a } = hexToRgb({ color })
  const center = atlasPixelForUv({
    u,
    v,
    width: buffer.width,
    height: buffer.height,
  })
  const pixelRadius = Math.max(1, Math.round(radius * buffer.width))
  const scaledA = Math.round(a * Math.min(1, Math.max(0, opacity)))

  for (let dy = -pixelRadius; dy <= pixelRadius; dy += 1) {
    for (let dx = -pixelRadius; dx <= pixelRadius; dx += 1) {
      if (dx * dx + dy * dy > pixelRadius * pixelRadius) {
        continue
      }

      const column = center.column + dx
      const row = center.row + dy

      if (
        column < 0 ||
        row < 0 ||
        column >= buffer.width ||
        row >= buffer.height
      ) {
        continue
      }

      writePixel({
        buffer,
        index: (row * buffer.width + column) * 4,
        r,
        g,
        b,
        a: scaledA,
        erase,
      })
    }
  }
}

function drawStroke({
  buffer,
  stroke,
}: {
  buffer: AtlasBuffer
  stroke: Stroke
}) {
  if (stroke.tool === 'fill') {
    const { r, g, b, a } = hexToRgb({ color: stroke.color })
    const rect = atlasSourceRect({
      panel: stroke.panel,
      width: buffer.width,
      height: buffer.height,
    })
    const startColumn = Math.max(0, Math.floor(rect.sourceX))
    const startRow = Math.max(0, Math.floor(rect.sourceY))
    const endColumn = Math.min(
      buffer.width,
      Math.ceil(rect.sourceX + rect.sourceWidth),
    )
    const endRow = Math.min(
      buffer.height,
      Math.ceil(rect.sourceY + rect.sourceHeight),
    )

    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        writePixel({
          buffer,
          index: (row * buffer.width + column) * 4,
          r,
          g,
          b,
          a,
        })
      }
    }

    return
  }

  if (stroke.points.length === 0) {
    return
  }

  const points =
    stroke.points.length === 1
      ? [stroke.points[0], stroke.points[0]]
      : stroke.points

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]

    if (!from || !to) {
      continue
    }

    const start = panelPointToUv({
      panel: stroke.panel,
      x: from.x,
      y: from.y,
    })
    const end = panelPointToUv({
      panel: stroke.panel,
      x: to.x,
      y: to.y,
    })
    const steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(end.u - start.u, end.v - start.v) * buffer.width * 1.4,
      ),
    )
    const pressure = to.p ?? from.p ?? 0.7
    const radius = stroke.width * (0.55 + pressure * 0.7)

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      stampDot({
        buffer,
        u: start.u + (end.u - start.u) * t,
        v: start.v + (end.v - start.v) * t,
        radius,
        color: stroke.color,
        erase: stroke.tool === 'eraser',
      })
    }
  }
}

function sampleSource({
  dest,
  source,
  column,
  row,
  srcX,
  srcY,
  opacity = 1,
  tint,
}: {
  dest: AtlasBuffer
  source: AtlasBuffer
  column: number
  row: number
  srcX: number
  srcY: number
  opacity?: number
  tint?: { r: number; g: number; b: number }
}) {
  if (column < 0 || row < 0 || column >= dest.width || row >= dest.height) {
    return
  }

  if (srcX < 0 || srcY < 0 || srcX >= source.width || srcY >= source.height) {
    return
  }

  const srcIndex = (srcY * source.width + srcX) * 4
  const a = Math.round((source.pixels[srcIndex + 3] ?? 0) * opacity)

  if (a === 0) {
    return
  }

  const sourceR = source.pixels[srcIndex] ?? 0
  const sourceG = source.pixels[srcIndex + 1] ?? 0
  const sourceB = source.pixels[srcIndex + 2] ?? 0

  writePixel({
    buffer: dest,
    index: (row * dest.width + column) * 4,
    r: tint ? Math.round((sourceR * tint.r) / 255) : sourceR,
    g: tint ? Math.round((sourceG * tint.g) / 255) : sourceG,
    b: tint ? Math.round((sourceB * tint.b) / 255) : sourceB,
    a,
  })
}

function blitBuffer({
  dest,
  source,
  destX,
  destY,
  destWidth,
  destHeight,
  rotation = 0,
  opacity = 1,
  tint,
}: {
  dest: AtlasBuffer
  source: AtlasBuffer
  destX: number
  destY: number
  destWidth: number
  destHeight: number
  rotation?: number
  opacity?: number
  tint?: { r: number; g: number; b: number }
}) {
  const width = Math.max(1, Math.round(destWidth))
  const height = Math.max(1, Math.round(destHeight))
  const clampedOpacity = Math.min(1, Math.max(0, opacity))

  if (rotation === 0) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        sampleSource({
          dest,
          source,
          column: Math.round(destX) + x,
          row: Math.round(destY) + y,
          srcX: Math.min(
            source.width - 1,
            Math.floor((x / width) * source.width),
          ),
          srcY: Math.min(
            source.height - 1,
            Math.floor((y / height) * source.height),
          ),
          opacity: clampedOpacity,
          tint,
        })
      }
    }
    return
  }

  const centerX = destX + width / 2
  const centerY = destY + height / 2
  const pad = Math.ceil(Math.hypot(width, height) / 2)
  const cos = Math.cos(-rotation)
  const sin = Math.sin(-rotation)

  for (let row = Math.floor(centerY - pad); row <= Math.ceil(centerY + pad); row += 1) {
    for (let column = Math.floor(centerX - pad); column <= Math.ceil(centerX + pad); column += 1) {
      const localX = column - centerX
      const localY = row - centerY
      const sourceX = localX * cos - localY * sin + width / 2
      const sourceY = localX * sin + localY * cos + height / 2

      if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) {
        continue
      }

      sampleSource({
        dest,
        source,
        column,
        row,
        srcX: Math.min(
          source.width - 1,
          Math.floor((sourceX / width) * source.width),
        ),
        srcY: Math.min(
          source.height - 1,
          Math.floor((sourceY / height) * source.height),
        ),
        opacity: clampedOpacity,
        tint,
      })
    }
  }
}

function drawArtLayer({
  buffer,
  image,
}: {
  buffer: AtlasBuffer
  image: AtlasBuffer
}) {
  blitBuffer({
    dest: buffer,
    source: image,
    destX: 0,
    destY: 0,
    destWidth: buffer.width,
    destHeight: buffer.height,
  })
}

function drawTextMark({
  buffer,
  layer,
}: {
  buffer: AtlasBuffer
  layer: Extract<DesignLayer, { kind: 'text' }>
}) {
  if (!layer.content.trim()) {
    return
  }

  const origin = panelPointToUv({
    panel: layer.panel,
    x: layer.x,
    y: layer.y,
  })

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = buffer.width
    canvas.height = buffer.height
    const context = canvas.getContext('2d')

    if (context) {
      const px = origin.u * buffer.width
      const py = (1 - origin.v) * buffer.height
      const fontSize = Math.max(14, layer.scale * buffer.width)
      const face =
        layer.face === 'sans'
          ? 'Outfit, "Avenir Next", sans-serif'
          : '"Cormorant Garamond", Palatino, serif'
      context.font = `600 ${fontSize}px ${face}`
      context.fillStyle = layer.color
      context.globalAlpha = Math.min(1, Math.max(0, layer.opacity ?? 1))
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.save()
      context.translate(px, py)
      context.rotate(layer.rotation)
      context.fillText(layer.content.slice(0, 32), 0, 0)
      context.restore()
      const pixels = context.getImageData(0, 0, buffer.width, buffer.height)
      blitBuffer({
        dest: buffer,
        source: {
          width: buffer.width,
          height: buffer.height,
          pixels: pixels.data,
        },
        destX: 0,
        destY: 0,
        destWidth: buffer.width,
        destHeight: buffer.height,
        opacity: 1,
      })
      return
    }
  }

  const width = Math.max(0.04, layer.scale * 1.8)
  const height = Math.max(0.02, layer.scale * 0.45)
  const markOpacity = Math.min(1, Math.max(0, layer.opacity ?? 1))

  for (let x = 0; x < 12; x += 1) {
    for (let y = 0; y < 4; y += 1) {
      stampDot({
        buffer,
        u: origin.u + (x / 11 - 0.5) * width,
        v: origin.v + (0.5 - y / 3) * height,
        radius: 0.008,
        color: layer.color,
        erase: false,
        opacity: markOpacity,
      })
    }
  }
}

function drawPatternMark({
  buffer,
  layer,
}: {
  buffer: AtlasBuffer
  layer: Extract<DesignLayer, { kind: 'pattern' }>
}) {
  const tile = 64
  const source = createAtlasBuffer({ width: tile, height: tile })
  const { r, g, b, a } = hexToRgb({ color: layer.color })
  const band = 8

  for (let row = 0; row < tile; row += 1) {
    for (let column = 0; column < tile; column += 1) {
      let fill = false
      let alpha = a

      if (layer.patternId === 'gradient') {
        fill = true
        alpha = Math.round(a * (1 - row / Math.max(1, tile - 1)))
      } else if (layer.patternId === 'check') {
        fill =
          (Math.floor(column / band) + Math.floor(row / band)) % 2 === 0
      } else {
        fill = Math.floor(row / band) % 2 === 0
      }

      if (!fill) {
        continue
      }

      writePixel({
        buffer: source,
        index: (row * tile + column) * 4,
        r,
        g,
        b,
        a: alpha,
      })
    }
  }

  const origin = panelPointToUv({
    panel: layer.panel,
    x: layer.x,
    y: layer.y,
  })
  const pixel = atlasPixelForUv({
    u: origin.u,
    v: origin.v,
    width: buffer.width,
    height: buffer.height,
  })
  const size = Math.max(
    18,
    Math.round(
      layer.scale * buffer.width * (layer.patternId === 'gradient' ? 1.35 : 1),
    ),
  )

  blitBuffer({
    dest: buffer,
    source,
    destX: pixel.column - size / 2,
    destY: pixel.row - size / 2,
    destWidth: size,
    destHeight: size,
    rotation: layer.rotation,
    opacity: layer.opacity ?? 1,
  })
}

function drawGraphicMark({
  buffer,
  layer,
  image,
}: {
  buffer: AtlasBuffer
  layer: Extract<DesignLayer, { kind: 'graphic' }>
  image?: AtlasBuffer
}) {
  if (!image) {
    return
  }

  const origin = panelPointToUv({
    panel: layer.panel,
    x: layer.x,
    y: layer.y,
  })
  const pixel = atlasPixelForUv({
    u: origin.u,
    v: origin.v,
    width: buffer.width,
    height: buffer.height,
  })
  const size = Math.max(12, Math.round(layer.scale * buffer.width))
  const tint = layer.color ? hexToRgb({ color: layer.color }) : undefined

  blitBuffer({
    dest: buffer,
    source: image,
    destX: pixel.column - size / 2,
    destY: pixel.row - size / 2,
    destWidth: size,
    destHeight: size,
    rotation: layer.rotation,
    opacity: layer.opacity ?? 1,
    ...(tint ? { tint: { r: tint.r, g: tint.g, b: tint.b } } : {}),
  })
}

export function createAtlasBuffer({
  width = ATLAS_SIZE,
  height = ATLAS_SIZE,
}: {
  width?: number
  height?: number
} = {}): AtlasBuffer {
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  }
}

export function rasterizeLayers({
  document,
  extraStroke,
  width = ATLAS_SIZE,
  height = ATLAS_SIZE,
  images,
}: {
  document: DesignDocument
  extraStroke?: Stroke | null
  width?: number
  height?: number
  images?: Record<string, AtlasBuffer>
}): AtlasBuffer {
  const buffer = createAtlasBuffer({ width, height })

  for (const layer of document.layers) {
    if (!layer.visible) {
      continue
    }

    if (layer.kind === 'art') {
      const image = images?.[layer.src]
      if (image) {
        drawArtLayer({ buffer, image })
      }
      continue
    }

    if (layer.kind === 'paint') {
      for (const stroke of layer.strokes) {
        drawStroke({ buffer, stroke })
      }
    }

    if (layer.kind === 'text') {
      drawTextMark({ buffer, layer })
    }

    if (layer.kind === 'graphic') {
      drawGraphicMark({
        buffer,
        layer,
        image: images?.[layer.src],
      })
    }

    if (layer.kind === 'pattern') {
      drawPatternMark({ buffer, layer })
    }
  }

  if (extraStroke) {
    drawStroke({ buffer, stroke: extraStroke })
  }

  return buffer
}

export function bakePublishedArt({
  document: designDocument,
  images,
}: {
  document: DesignDocument
  images?: Record<string, AtlasBuffer>
}) {
  if (typeof globalThis.document === 'undefined') {
    return ''
  }

  for (const size of [512, 256, 160]) {
    const buffer = rasterizeLayers({
      document: designDocument,
      width: size,
      height: size,
      images,
    })
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = buffer.width
    canvas.height = buffer.height
    const context = canvas.getContext('2d')

    if (!context) {
      continue
    }

    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(buffer.pixels),
        buffer.width,
        buffer.height,
      ),
      0,
      0,
    )

    for (const type of ['image/webp', 'image/png'] as const) {
      const dataUrl =
        type === 'image/webp'
          ? canvas.toDataURL(type, 0.82)
          : canvas.toDataURL(type)

      if (
        isSafeDataImage({ dataUrl, maxChars: MAX_ART_MAP_CHARS }) &&
        dataUrl.startsWith(`data:${type}`)
      ) {
        return dataUrl
      }
    }
  }

  return ''
}

export function atlasPixelAtPanel({
  buffer,
  panel,
  x,
  y,
}: {
  buffer: AtlasBuffer
  panel: DesignDocument['layers'][number] extends never ? never : Stroke['panel']
  x: number
  y: number
}) {
  const uv = panelPointToUv({ panel, x, y, rects: DEFAULT_PANEL_UV })
  const { index } = atlasPixelForUv({
    u: uv.u,
    v: uv.v,
    width: buffer.width,
    height: buffer.height,
  })

  return {
    r: buffer.pixels[index] ?? 0,
    g: buffer.pixels[index + 1] ?? 0,
    b: buffer.pixels[index + 2] ?? 0,
    a: buffer.pixels[index + 3] ?? 0,
  }
}

export function atlasBufferToDataUrl({
  buffer,
}: {
  buffer: AtlasBuffer
}) {
  if (typeof document === 'undefined') {
    return ''
  }

  const canvas = document.createElement('canvas')
  canvas.width = buffer.width
  canvas.height = buffer.height
  const context = canvas.getContext('2d')

  if (!context) {
    return ''
  }

  context.putImageData(
    new ImageData(
      new Uint8ClampedArray(buffer.pixels),
      buffer.width,
      buffer.height,
    ),
    0,
    0,
  )

  return canvas.toDataURL('image/png')
}

export function paintOverCloth({
  cloth,
  ink,
}: {
  cloth: { r: number; g: number; b: number }
  ink: { r: number; g: number; b: number; a: number }
}) {
  const alpha = ink.a / 255

  return {
    r: Math.round(ink.r * alpha + cloth.r * (1 - alpha)),
    g: Math.round(ink.g * alpha + cloth.g * (1 - alpha)),
    b: Math.round(ink.b * alpha + cloth.b * (1 - alpha)),
  }
}
