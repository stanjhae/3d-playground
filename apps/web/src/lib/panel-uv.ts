import type { PanelId } from './design-document'
import { TORSO_V0 } from './tee-geometry'

export type UvRect = {
  u0: number
  v0: number
  u1: number
  v1: number
}

export const DEFAULT_PANEL_UV: Record<PanelId, UvRect> = {
  front: { u0: 0, v0: TORSO_V0, u1: 0.5, v1: 1 },
  back: { u0: 0.5, v0: TORSO_V0, u1: 1, v1: 1 },
  left: { u0: 0, v0: 0, u1: 0.5, v1: TORSO_V0 },
  right: { u0: 0.5, v0: 0, u1: 1, v1: TORSO_V0 },
}

export function clamp01({ value }: { value: number }) {
  return Math.min(1, Math.max(0, value))
}

export function panelPointToUv({
  panel,
  x,
  y,
  rects = DEFAULT_PANEL_UV,
}: {
  panel: PanelId
  x: number
  y: number
  rects?: Record<PanelId, UvRect>
}) {
  const rect = rects[panel]
  const u = rect.u0 + clamp01({ value: x }) * (rect.u1 - rect.u0)
  let v = rect.v0 + clamp01({ value: y }) * (rect.v1 - rect.v0)

  if (rect.v1 < 1 - 1e-9) {
    v = Math.min(v, rect.v1 - 1e-6)
  }

  return { u, v }
}

export function uvOnPanel({
  panel,
  u,
  v,
  rects = DEFAULT_PANEL_UV,
}: {
  panel: PanelId
  u: number
  v: number
  rects?: Record<PanelId, UvRect>
}) {
  const rect = rects[panel]
  const width = rect.u1 - rect.u0
  const height = rect.v1 - rect.v0

  return {
    x: clamp01({ value: width === 0 ? 0 : (u - rect.u0) / width }),
    y: clamp01({ value: height === 0 ? 0 : (v - rect.v0) / height }),
  }
}

export function uvToPanelPoint({
  u,
  v,
  rects = DEFAULT_PANEL_UV,
}: {
  u: number
  v: number
  rects?: Record<PanelId, UvRect>
}): { panel: PanelId; x: number; y: number } | null {
  const panels = Object.keys(rects) as PanelId[]

  for (const panel of panels) {
    const rect = rects[panel]
    const width = rect.u1 - rect.u0
    const height = rect.v1 - rect.v0

    const atTop = rect.v1 >= 1 - 1e-9
    const inV = atTop
      ? v + 1e-6 >= rect.v0 && v - 1e-6 <= rect.v1
      : v + 1e-6 >= rect.v0 && v < rect.v1

    if (
      u + 1e-6 >= rect.u0 &&
      u - 1e-6 <= rect.u1 &&
      inV &&
      width > 0 &&
      height > 0
    ) {
      return {
        panel,
        x: clamp01({ value: (u - rect.u0) / width }),
        y: clamp01({ value: (v - rect.v0) / height }),
      }
    }
  }

  return null
}

export function atlasSourceRect({
  panel,
  width,
  height,
  rects = DEFAULT_PANEL_UV,
}: {
  panel: PanelId
  width: number
  height: number
  rects?: Record<PanelId, UvRect>
}) {
  const rect = rects[panel]

  return {
    sourceX: rect.u0 * width,
    sourceY: (1 - rect.v1) * height,
    sourceWidth: (rect.u1 - rect.u0) * width,
    sourceHeight: (rect.v1 - rect.v0) * height,
  }
}

export function atlasPixelForUv({
  u,
  v,
  width,
  height,
}: {
  u: number
  v: number
  width: number
  height: number
}) {
  const column = Math.min(
    width - 1,
    Math.max(0, Math.floor(clamp01({ value: u }) * width)),
  )
  const row = Math.min(
    height - 1,
    Math.max(0, Math.floor((1 - clamp01({ value: v })) * height)),
  )

  return { column, row, index: (row * width + column) * 4 }
}
