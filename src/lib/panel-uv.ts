import type { PanelId } from './design-document'

export type UvRect = {
  u0: number
  v0: number
  u1: number
  v1: number
}

export const DEFAULT_PANEL_UV: Record<PanelId, UvRect> = {
  front: { u0: 0, v0: 0, u1: 0.5, v1: 1 },
  back: { u0: 0.5, v0: 0, u1: 1, v1: 1 },
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

  return {
    u: rect.u0 + clamp01({ value: x }) * (rect.u1 - rect.u0),
    v: rect.v0 + clamp01({ value: y }) * (rect.v1 - rect.v0),
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
  for (const panel of ['front', 'back'] as const) {
    const rect = rects[panel]
    const width = rect.u1 - rect.u0
    const height = rect.v1 - rect.v0

    if (
      u + 1e-6 >= rect.u0 &&
      u - 1e-6 <= rect.u1 &&
      v + 1e-6 >= rect.v0 &&
      v - 1e-6 <= rect.v1 &&
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
