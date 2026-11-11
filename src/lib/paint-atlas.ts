import type { DesignDocument, DesignLayer, Stroke } from './design-document'
import { imageBox } from './canonical-document'
import { MAX_ART_MAP_CHARS, isSafeDataImage } from './look-thumbnail'
import {
  atlasPixelForUv,
  atlasSourceRect,
  panelPointToUv,
} from './panel-uv'
import { textCanvasFont, textFaceState } from './text-faces'

export const ATLAS_SIZE = 512

export type AtlasBuffer = {
  width: number
  height: number
  pixels: Uint8ClampedArray
  /** Writes outside these pixel bounds (end-exclusive) are dropped. */
  clip?: { x0: number; y0: number; x1: number; y1: number }
  /** The document's panel rectangles; absent means `DEFAULT_PANEL_UV` (the tee). */
  panelUv?: DesignDocument['panelUv']
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

  if (buffer.clip) {
    const pixel = index / 4
    const column = pixel % buffer.width
    const row = Math.floor(pixel / buffer.width)
    const { x0, y0, x1, y1 } = buffer.clip

    if (column < x0 || column >= x1 || row < y0 || row >= y1) {
      return
    }
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

/** Exported for `stroke-cover.test.ts`, which pins it to plain dot stamping. */
export function drawStroke({
  buffer,
  stroke,
}: {
  buffer: AtlasBuffer
  stroke: Stroke
}) {
  if (stroke.tool === 'fill') {
    const { r, g, b, a } = hexToRgb({ color: stroke.color })
    const rect = atlasSourceRect({
      rects: buffer.panelUv,
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
  const dots: { u: number; v: number; radius: number }[] = []

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]

    if (!from || !to) {
      continue
    }

    const start = panelPointToUv({
    rects: buffer.panelUv,
      panel: stroke.panel,
      x: from.x,
      y: from.y,
    })
    const end = panelPointToUv({
    rects: buffer.panelUv,
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
      dots.push({
        u: start.u + (end.u - start.u) * t,
        v: start.v + (end.v - start.v) * t,
        radius,
      })
    }
  }

  coverStroke({ buffer, dots, color: stroke.color, erase: stroke.tool === 'eraser' })
}

/**
 * The dots overlap many times along a stroke. Each covered pixel is found
 * once, row span by row span, then written once:
 * - a translucent brush composites at its alpha exactly once, so a 30%
 *   stroke reads as 30% wherever it lies (#158);
 * - an opaque brush or an eraser sets the pixel outright, which is what
 *   stamping every dot in turn produced, without the overdraw.
 */
function coverStroke({
  buffer,
  dots,
  color,
  erase,
}: {
  buffer: AtlasBuffer
  dots: { u: number; v: number; radius: number }[]
  color: string
  erase: boolean
}) {
  const columns = new Int32Array(dots.length)
  const rows = new Int32Array(dots.length)
  const radii = new Int32Array(dots.length)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity

  for (let index = 0; index < dots.length; index += 1) {
    const dot = dots[index]!
    const center = atlasPixelForUv({ u: dot.u, v: dot.v, width: buffer.width, height: buffer.height })
    const pixelRadius = Math.max(1, Math.round(dot.radius * buffer.width))
    columns[index] = center.column
    rows[index] = center.row
    radii[index] = pixelRadius
    x0 = Math.min(x0, center.column - pixelRadius)
    y0 = Math.min(y0, center.row - pixelRadius)
    x1 = Math.max(x1, center.column + pixelRadius)
    y1 = Math.max(y1, center.row + pixelRadius)
  }

  // Writes outside the clip are dropped, so nothing outside it is visited.
  const clip = buffer.clip
  x0 = Math.max(0, x0, clip ? clip.x0 : 0)
  y0 = Math.max(0, y0, clip ? clip.y0 : 0)
  x1 = Math.min(buffer.width - 1, x1, clip ? clip.x1 - 1 : Infinity)
  y1 = Math.min(buffer.height - 1, y1, clip ? clip.y1 - 1 : Infinity)

  if (x1 < x0 || y1 < y0) {
    return
  }

  const spanX = x1 - x0 + 1
  const covered = new Uint8Array(spanX * (y1 - y0 + 1))

  for (let index = 0; index < dots.length; index += 1) {
    const column = columns[index]!
    const row = rows[index]!
    const pixelRadius = radii[index]!
    // Consecutive dots often land on the same pixel at the same size.
    if (index > 0 && column === columns[index - 1] && row === rows[index - 1] && pixelRadius === radii[index - 1]) {
      continue
    }

    const squared = pixelRadius * pixelRadius

    for (let dy = Math.max(-pixelRadius, y0 - row); dy <= Math.min(pixelRadius, y1 - row); dy += 1) {
      // The widest dx with dx² + dy² ≤ r², as the disk test had it.
      let half = Math.floor(Math.sqrt(squared - dy * dy))
      while (half * half > squared - dy * dy) half -= 1
      while ((half + 1) * (half + 1) <= squared - dy * dy) half += 1
      const left = Math.max(x0, column - half)
      const right = Math.min(x1, column + half)

      if (left <= right) {
        const start = (row + dy - y0) * spanX
        covered.fill(1, start + left - x0, start + right - x0 + 1)
      }
    }
  }

  const { r, g, b, a } = hexToRgb({ color })
  const pixels = buffer.pixels
  const outright = erase || a >= 255

  for (let y = y0; y <= y1; y += 1) {
    const maskRow = (y - y0) * spanX

    for (let x = x0; x <= x1; x += 1) {
      if (!covered[maskRow + x - x0]) {
        continue
      }

      const index = (y * buffer.width + x) * 4

      if (outright) {
        pixels[index] = erase ? 0 : r
        pixels[index + 1] = erase ? 0 : g
        pixels[index + 2] = erase ? 0 : b
        pixels[index + 3] = erase ? 0 : 255
        continue
      }

      writePixel({ buffer, index, r, g, b, a })
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
  stretchY = 1,
  flipX = false,
  flipY = false,
}: {
  dest: AtlasBuffer
  source: AtlasBuffer
  destX: number
  destY: number
  destWidth: number
  /** Before `stretchY`, which applies after the turn, as on the cloth. */
  destHeight: number
  rotation?: number
  opacity?: number
  tint?: { r: number; g: number; b: number }
  stretchY?: number
  /** Mirror the source about its own axes, before the turn. */
  flipX?: boolean
  flipY?: boolean
}) {
  const sourceColumn = (column: number) => (flipX ? source.width - 1 - column : column)
  const sourceRow = (row: number) => (flipY ? source.height - 1 - row : row)
  const width = Math.max(1, Math.round(destWidth))
  const height = Math.max(1, Math.round(destHeight))
  const shownHeight = Math.max(1, Math.round(destHeight * stretchY))
  const clampedOpacity = Math.min(1, Math.max(0, opacity))

  if (rotation === 0) {
    for (let y = 0; y < shownHeight; y += 1) {
      for (let x = 0; x < width; x += 1) {
        sampleSource({
          dest,
          source,
          column: Math.round(destX) + x,
          row: Math.round(destY) + y,
          srcX: sourceColumn(Math.min(
            source.width - 1,
            Math.floor((x / width) * source.width),
          )),
          srcY: sourceRow(Math.min(
            source.height - 1,
            Math.floor((y / shownHeight) * source.height),
          )),
          opacity: clampedOpacity,
          tint,
        })
      }
    }
    return
  }

  const centerX = destX + width / 2
  const centerY = destY + shownHeight / 2
  const pad = Math.ceil((Math.hypot(width, height) / 2) * Math.max(1, stretchY))
  const cos = Math.cos(-rotation)
  const sin = Math.sin(-rotation)

  for (let row = Math.floor(centerY - pad); row <= Math.ceil(centerY + pad); row += 1) {
    for (let column = Math.floor(centerX - pad); column <= Math.ceil(centerX + pad); column += 1) {
      const localX = column - centerX
      const localY = (row - centerY) / stretchY
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
        srcX: sourceColumn(Math.min(
          source.width - 1,
          Math.floor((sourceX / width) * source.width),
        )),
        srcY: sourceRow(Math.min(
          source.height - 1,
          Math.floor((sourceY / height) * source.height),
        )),
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

/**
 * What a word whose face is still loading draws: the fallback face (the 2D
 * panel, so the word shows at once) or nothing yet (the 3D view, which
 * fills in when the face arrives). See text-faces.ts.
 */
export type PendingText = 'fallback' | 'skip'

function drawTextMark({
  buffer,
  layer,
  pendingText,
}: {
  buffer: AtlasBuffer
  layer: Extract<DesignLayer, { kind: 'text' }>
  pendingText: PendingText
}) {
  if (!layer.content.trim()) {
    return
  }

  const origin = panelPointToUv({
    rects: buffer.panelUv,
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
      const shown = layer.content.slice(0, 32)
      const state = textFaceState({ face: layer.face, text: shown })

      if (state === 'loading' && pendingText === 'skip') {
        return
      }

      const px = origin.u * buffer.width
      const py = (1 - origin.v) * buffer.height
      const fontSize = Math.max(14, layer.scale * buffer.width)
      context.font = textCanvasFont({ face: layer.face, size: fontSize, state })
      context.fillStyle = layer.color
      context.globalAlpha = Math.min(1, Math.max(0, layer.opacity ?? 1))
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.save()
      context.translate(px, py)

      if (layer.surface) {
        context.scale(1, layer.surface.stretchY)
      }

      context.rotate(layer.rotation)

      if (layer.flipX || layer.flipY) {
        context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1)
      }

      context.fillText(shown, 0, 0)
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
  const height = Math.max(0.02, layer.scale * 0.45) * (layer.surface?.stretchY ?? 1)
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
  if (layer.period !== undefined && layer.patternId !== 'gradient') {
    drawPeriodicPattern({ buffer, layer, period: layer.period })
    return
  }

  const tile = 64
  const source = createAtlasBuffer({ width: tile, height: tile })
  const { r, g, b, a } = hexToRgb({ color: layer.color })
  const band = 8

  for (let row = 0; row < tile; row += 1) {
    for (let column = 0; column < tile; column += 1) {
      let fill: boolean
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
    rects: buffer.panelUv,
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

/**
 * Stripes or check whose repeat is `period` atlas widths (half stripe,
 * half gap), computed per atlas pixel so the period holds at every atlas
 * size: 2D panel, scene and published art agree (#161). The stamp is the
 * same rotated square as the legacy tile, and the phase starts at its
 * top-left corner.
 */
function drawPeriodicPattern({
  buffer,
  layer,
  period,
}: {
  buffer: AtlasBuffer
  layer: Extract<DesignLayer, { kind: 'pattern' }>
  period: number
}) {
  const { r, g, b, a } = hexToRgb({ color: layer.color })
  const alpha = Math.round(a * Math.min(1, Math.max(0, layer.opacity ?? 1)))

  if (alpha === 0) {
    return
  }

  const origin = panelPointToUv({ panel: layer.panel, x: layer.x, y: layer.y, rects: buffer.panelUv })
  const pixel = atlasPixelForUv({
    u: origin.u,
    v: origin.v,
    width: buffer.width,
    height: buffer.height,
  })
  const size = Math.max(18, Math.round(layer.scale * buffer.width))
  const band = Math.max(1, (period * buffer.width) / 2)
  const half = size / 2
  const pad = Math.ceil(Math.hypot(size, size) / 2)
  const cos = Math.cos(-layer.rotation)
  const sin = Math.sin(-layer.rotation)
  // Only visit pixels that can be written: the stamp within the clip.
  const clip = buffer.clip ?? { x0: 0, y0: 0, x1: buffer.width, y1: buffer.height }
  const row0 = Math.max(0, clip.y0, pixel.row - pad)
  const row1 = Math.min(buffer.height - 1, clip.y1 - 1, pixel.row + pad)
  const column0 = Math.max(0, clip.x0, pixel.column - pad)
  const column1 = Math.min(buffer.width - 1, clip.x1 - 1, pixel.column + pad)

  for (let row = row0; row <= row1; row += 1) {
    for (let column = column0; column <= column1; column += 1) {

      const localX = column - pixel.column
      const localY = row - pixel.row
      const x = localX * cos - localY * sin + half
      const y = localX * sin + localY * cos + half

      if (x < 0 || y < 0 || x >= size || y >= size) {
        continue
      }

      const stripe = Math.floor(y / band)
      const fill =
        layer.patternId === 'check'
          ? (Math.floor(x / band) + stripe) % 2 === 0
          : stripe % 2 === 0

      if (fill) {
        writePixel({ buffer, index: (row * buffer.width + column) * 4, r, g, b, a: alpha })
      }
    }
  }
}

/**
 * What an image layer with no bytes shows (#154): a hatched box with a
 * thin border at the layer's own box, at full strength whatever the
 * layer's opacity, so a missing or undecodable asset is never invisible.
 */
export const PLACEHOLDER_INK = '#8c8478'

function placeholderBuffer({ width, height }: { width: number; height: number }) {
  const source = createAtlasBuffer({ width, height })
  const { r, g, b } = hexToRgb({ color: PLACEHOLDER_INK })
  const border = Math.max(1, Math.round(Math.min(width, height) / 48))
  const spacing = Math.max(5, Math.round(Math.min(width, height) / 8))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x < border || y < border || x >= width - border || y >= height - border
      const hatch = (x + y) % spacing < Math.max(1, border)
      const a = edge ? 235 : hatch ? 170 : 36

      writePixel({ buffer: source, index: (y * width + x) * 4, r, g, b, a })
    }
  }

  return source
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
  const origin = panelPointToUv({
    rects: buffer.panelUv,
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
  const box = imageBox({ scale: layer.scale, aspect: layer.aspect ?? 1 })
  const width = Math.max(12, Math.round(box.width * buffer.width))
  const height = Math.max(12, Math.round(box.height * buffer.width))
  const stretchY = layer.surface?.stretchY ?? 1
  const tint = layer.color ? hexToRgb({ color: layer.color }) : undefined

  if (!image) {
    blitBuffer({
      dest: buffer,
      source: placeholderBuffer({ width, height }),
      destX: pixel.column - width / 2,
      destY: pixel.row - (height * stretchY) / 2,
      destWidth: width,
      destHeight: height,
      rotation: layer.rotation,
      stretchY,
      flipX: layer.flipX,
      flipY: layer.flipY,
    })
    return
  }

  blitBuffer({
    dest: buffer,
    source: image,
    destX: pixel.column - width / 2,
    destY: pixel.row - (height * stretchY) / 2,
    destWidth: width,
    destHeight: height,
    rotation: layer.rotation,
    stretchY,
    flipX: layer.flipX,
    flipY: layer.flipY,
    opacity: layer.opacity ?? 1,
    ...(tint ? { tint: { r: tint.r, g: tint.g, b: tint.b } } : {}),
  })
}

export function createAtlasBuffer({
  width = ATLAS_SIZE,
  height = ATLAS_SIZE,
  panelUv,
}: {
  width?: number
  height?: number
  panelUv?: DesignDocument['panelUv']
} = {}): AtlasBuffer {
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
    ...(panelUv ? { panelUv } : {}),
  }
}

/** Panelled garments (the tee, template-built forms) clip marks to each panel. */
function clipsPanels({ document }: { document: DesignDocument }) {
  return document.garmentId === 'tee' || Boolean(document.panelUv)
}

/**
 * The same pixels, with writes limited to one panel's atlas rectangle, so
 * a mark near an edge never lands on a neighbouring panel (E02 #153).
 */
function clipToPanel({
  buffer,
  panel,
}: {
  buffer: AtlasBuffer
  panel: Stroke['panel']
}): AtlasBuffer {
  const rect = atlasSourceRect({ panel, width: buffer.width, height: buffer.height, rects: buffer.panelUv })

  return {
    ...buffer,
    clip: {
      x0: Math.round(rect.sourceX),
      y0: Math.round(rect.sourceY),
      x1: Math.round(rect.sourceX + rect.sourceWidth),
      y1: Math.round(rect.sourceY + rect.sourceHeight),
    },
  }
}

/** The smallest clip holding all of these, or null for none. */
function unionClip({ clips }: { clips: Array<NonNullable<AtlasBuffer['clip']>> }) {
  if (clips.length === 0) {
    return null
  }

  return clips.reduce((union, clip) => ({
    x0: Math.min(union.x0, clip.x0),
    y0: Math.min(union.y0, clip.y0),
    x1: Math.max(union.x1, clip.x1),
    y1: Math.max(union.y1, clip.y1),
  }))
}

export function rasterizeLayers({
  document,
  extraStroke,
  extraStrokeLayerId,
  width = ATLAS_SIZE,
  height = ATLAS_SIZE,
  images,
  pendingText = 'fallback',
}: {
  document: DesignDocument
  extraStroke?: Stroke | null
  /**
   * The paint layer a live eraser stroke will be committed to. The eraser
   * previews inside that layer only; an id not in the document means the
   * stroke starts a new layer, where it has nothing to erase. Left out, a
   * live stroke is drawn on top of everything (concept garments).
   */
  extraStrokeLayerId?: string | null
  width?: number
  height?: number
  images?: Record<string, AtlasBuffer>
  pendingText?: PendingText
}): AtlasBuffer {
  const buffer = createAtlasBuffer({ width, height, panelUv: document.panelUv })
  // Tee panels are separate print regions; concept garments keep v1 drawing.
  const target = ({ panel }: { panel: Stroke['panel'] }) =>
    clipsPanels({ document }) ? clipToPanel({ buffer, panel }) : buffer
  const liveEraser = extraStroke?.tool === 'eraser' && extraStrokeLayerId !== undefined
  // A live stroke previews inside the layer it will be committed to, so it
  // looks as it will once saved: at that layer's opacity, under its erasers.
  const liveLayerId =
    liveEraser || (extraStroke?.tool === 'brush' && extraStrokeLayerId)
      ? extraStrokeLayerId
      : undefined
  let liveDrawn = false
  // One scratch buffer, cleared over each paint layer's region in turn.
  let scratch: AtlasBuffer | null = null
  const layerBuffer = ({ region }: { region: NonNullable<AtlasBuffer['clip']> }) => {
    if (!scratch) {
      scratch = createAtlasBuffer({ width, height, panelUv: document.panelUv })
      return scratch
    }

    for (let row = region.y0; row < region.y1; row += 1) {
      scratch.pixels.fill(0, (row * width + region.x0) * 4, (row * width + region.x1) * 4)
    }
    return scratch
  }

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
      const opacity = paintOpacity({ layer })
      const live = liveLayerId !== undefined && layer.id === liveLayerId ? extraStroke : null
      const strokes = live ? [...layer.strokes, live] : layer.strokes
      liveDrawn ||= Boolean(live)

      // Without an eraser, an opaque layer draws straight onto the atlas.
      if (drawsDirect({ opacity, strokes })) {
        for (const stroke of strokes) {
          drawStroke({ buffer: target(stroke), stroke })
        }
        continue
      }

      // Otherwise the layer is drawn on its own and composited once (#158,
      // #159), so its erasers clear only its own strokes, never the text,
      // graphics, pattern or paint beneath.
      const region = paintRegion({ document, buffer, strokes })

      if (!region) {
        continue
      }

      const own = layerBuffer({ region })

      for (const stroke of strokes) {
        drawStroke({
          buffer: clipsPanels({ document }) ? clipToPanel({ buffer: own, panel: stroke.panel }) : own,
          stroke,
        })
      }

      compositeRegion({ dest: buffer, source: own, region, opacity })
      continue
    }

    if (layer.kind === 'text') {
      drawTextMark({ buffer: target(layer), layer, pendingText })
    }

    if (layer.kind === 'graphic') {
      drawGraphicMark({
        buffer: target(layer),
        layer,
        image: images?.[layer.src],
      })
    }

    if (layer.kind === 'pattern') {
      drawPatternMark({ buffer: target(layer), layer })
    }
  }

  // A live eraser on a layer not drawn yet starts a new, empty layer: it
  // has nothing of its own to erase, as after it is committed. A brush that
  // starts a new layer is drawn on top, where that layer will be.
  if (extraStroke && !liveEraser && !liveDrawn) {
    drawStroke({ buffer: target(extraStroke), stroke: extraStroke })
  }

  return buffer
}

type PaintLayer = Extract<DesignLayer, { kind: 'paint' }>
type Region = NonNullable<AtlasBuffer['clip']>

function paintOpacity({ layer }: { layer: PaintLayer }) {
  return Math.min(1, Math.max(0, layer.opacity ?? 1))
}

function drawsDirect({ opacity, strokes }: { opacity: number; strokes: readonly Stroke[] }) {
  return opacity >= 1 && !strokes.some((stroke) => stroke.tool === 'eraser')
}

/** The pixels a paint layer drawn on its own covers: only its panels on the tee. */
function paintRegion({
  document,
  buffer,
  strokes,
}: {
  document: DesignDocument
  buffer: AtlasBuffer
  strokes: readonly Stroke[]
}): Region | null {
  const region =
    clipsPanels({ document })
      ? unionClip({ clips: strokes.map((stroke) => clipToPanel({ buffer, panel: stroke.panel }).clip!) })
      : { x0: 0, y0: 0, x1: buffer.width, y1: buffer.height }

  if (!region) {
    return null
  }

  return {
    x0: Math.max(0, region.x0),
    y0: Math.max(0, region.y0),
    x1: Math.min(buffer.width, region.x1),
    y1: Math.min(buffer.height, region.y1),
  }
}

function compositeRegion({
  dest,
  source,
  region,
  opacity,
}: {
  dest: AtlasBuffer
  source: AtlasBuffer
  region: Region
  opacity: number
}) {
  for (let row = region.y0; row < region.y1; row += 1) {
    for (let column = region.x0; column < region.x1; column += 1) {
      sampleSource({ dest, source, column, row, srcX: column, srcY: row, opacity })
    }
  }
}

function copyBuffer({ buffer }: { buffer: AtlasBuffer }): AtlasBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    pixels: new Uint8ClampedArray(buffer.pixels),
    ...(buffer.panelUv ? { panelUv: buffer.panelUv } : {}),
  }
}

type RasterInput = Parameters<typeof rasterizeLayers>[0]

/**
 * How a live stroke can be drawn from a cache, given where it will land:
 * - `over`: on top of the finished design (a new layer, or an opaque top
 *   layer with no erasers);
 * - `isolated`: into its layer's own pixels, composited over the design
 *   beneath (a translucent or erased layer, or any live eraser);
 * - `none`: an eraser with nothing of its own to erase;
 * - `full`: anything else, drawn by `rasterizeLayers` every frame.
 */
type LivePlan =
  | { kind: 'full' }
  | { kind: 'over' }
  | { kind: 'none' }
  | { kind: 'isolated'; index: number; layer: PaintLayer; opacity: number }

function touchesPanel({ layer, panel }: { layer: DesignLayer; panel: Stroke['panel'] }) {
  if (layer.kind === 'paint') {
    return layer.strokes.some((stroke) => stroke.panel === panel)
  }

  return layer.kind === 'art' || layer.panel === panel
}

function livePlan({
  document,
  stroke,
  layerId,
}: {
  document: DesignDocument
  stroke: Stroke
  layerId: string | null | undefined
}): LivePlan {
  // Concept garments draw without panel clips, so order matters everywhere.
  if (!clipsPanels({ document }) || stroke.tool === 'fill' || layerId === undefined) {
    return { kind: 'full' }
  }

  const index = layerId === null
    ? -1
    : document.layers.findIndex((layer) => layer.kind === 'paint' && layer.visible && layer.id === layerId)

  if (index < 0) {
    return stroke.tool === 'eraser' ? { kind: 'none' } : { kind: 'over' }
  }

  // Panels never overlap, so only what is drawn later on the same panel can
  // cover the stroke; then nothing can be cached beneath it.
  if (document.layers.slice(index + 1).some((layer) => layer.visible && touchesPanel({ layer, panel: stroke.panel }))) {
    return { kind: 'full' }
  }

  const layer = document.layers[index] as PaintLayer
  const opacity = paintOpacity({ layer })

  if (drawsDirect({ opacity, strokes: [...layer.strokes, stroke] })) {
    return { kind: 'over' }
  }

  // The layer is composited over its whole region; one panel keeps that exact.
  if (layer.strokes.some((own) => own.panel !== stroke.panel)) {
    return { kind: 'full' }
  }

  return { kind: 'isolated', index, layer, opacity }
}

type LiveCache = {
  key: readonly unknown[]
  plan: LivePlan
  base: AtlasBuffer
  own: AtlasBuffer | null
}

function sameKey({ a, b }: { a: readonly unknown[]; b: readonly unknown[] }) {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}

/**
 * Draws the design with a live stroke, as `rasterizeLayers` does, pixel for
 * pixel, without redrawing the whole design for every point: what lies under
 * the stroke is drawn once at pen-down and reused while the stroke grows.
 * The stroke itself is redrawn whole each frame, because stamping only its
 * new points would composite overlapping dots twice.
 *
 * Each view keeps its own instance, since they differ in `pendingText`.
 * `fontVersion` must change whenever a text face finishes loading. With
 * `enabled: false` every frame is a full redraw.
 */
export function createLiveAtlas({ enabled = true }: { enabled?: boolean } = {}) {
  let cache: LiveCache | null = null

  return function renderLive(input: RasterInput & { fontVersion?: unknown }): AtlasBuffer {
    const { fontVersion, ...raster } = input
    const { document, extraStroke, extraStrokeLayerId, images, pendingText = 'fallback' } = raster
    const width = raster.width ?? ATLAS_SIZE
    const height = raster.height ?? ATLAS_SIZE

    if (!extraStroke || !enabled) {
      cache = null
      return rasterizeLayers(raster)
    }

    const key = [
      document,
      images,
      pendingText,
      width,
      height,
      fontVersion,
      extraStrokeLayerId,
      extraStroke.panel,
      extraStroke.tool,
    ]

    if (!cache || !sameKey({ a: cache.key, b: key })) {
      const plan = livePlan({ document, stroke: extraStroke, layerId: extraStrokeLayerId })

      if (plan.kind === 'full') {
        cache = null
        return rasterizeLayers(raster)
      }

      const shared = { images, pendingText, width, height }
      let own: AtlasBuffer | null = null
      let base: AtlasBuffer

      if (plan.kind === 'isolated') {
        base = rasterizeLayers({
          ...shared,
          document: { ...document, layers: document.layers.filter((_, index) => index !== plan.index) },
        })
        own = createAtlasBuffer({ width, height, panelUv: document.panelUv })

        for (const stroke of plan.layer.strokes) {
          drawStroke({ buffer: clipToPanel({ buffer: own, panel: stroke.panel }), stroke })
        }
      } else {
        base = rasterizeLayers({ ...shared, document })
      }

      cache = { key, plan, base, own }
    }

    const { plan, base, own } = cache
    const out = copyBuffer({ buffer: base })

    if (plan.kind === 'over') {
      drawStroke({ buffer: clipToPanel({ buffer: out, panel: extraStroke.panel }), stroke: extraStroke })
    }

    if (plan.kind === 'isolated' && own) {
      const layerOwn = copyBuffer({ buffer: own })
      drawStroke({ buffer: clipToPanel({ buffer: layerOwn, panel: extraStroke.panel }), stroke: extraStroke })
      const region = paintRegion({ document, buffer: out, strokes: [...plan.layer.strokes, extraStroke] })

      if (region) {
        compositeRegion({ dest: out, source: layerOwn, region, opacity: plan.opacity })
      }
    }

    return out
  }
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
  const uv = panelPointToUv({ panel, x, y, rects: buffer.panelUv })
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
