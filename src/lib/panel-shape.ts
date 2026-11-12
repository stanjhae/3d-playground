import type { Mesh, Object3D } from 'three'
import { create } from 'zustand'

import type { DesignDocument, PanelId } from './design-document'

type UvRect = { u0: number; v0: number; u1: number; v1: number }

/**
 * The triangles that print on one panel, in that panel's coordinates
 * (x left→right, y hem→top, 0–1), from a mesh's print UVs (`uv1`).
 * A triangle counts when all three corners sit inside the panel's atlas
 * rectangle; unprinted vertices sit at (−1, −1) and never do.
 * Flat [x0, y0, x1, y1, x2, y2, …].
 */
export function panelTriangles({
  uvs,
  index,
  rect,
}: {
  uvs: ArrayLike<number>
  index: ArrayLike<number> | null
  rect: UvRect
}): number[] {
  const width = rect.u1 - rect.u0
  const height = rect.v1 - rect.v0
  const count = index ? index.length : uvs.length / 2
  const out: number[] = []

  if (width <= 0 || height <= 0) {
    return out
  }

  for (let corner = 0; corner + 2 < count; corner += 3) {
    const triangle: number[] = []

    for (let k = 0; k < 3; k += 1) {
      const vertex = index ? index[corner + k]! : corner + k
      const u = uvs[vertex * 2]!
      const v = uvs[vertex * 2 + 1]!

      if (u < rect.u0 || u > rect.u1 || v < rect.v0 || v > rect.v1) {
        break
      }

      triangle.push((u - rect.u0) / width, (v - rect.v0) / height)
    }

    if (triangle.length === 6) {
      out.push(...triangle)
    }
  }

  return out
}

/**
 * Each panel's printable shape for the model in the scene, so the flat
 * sides can show where a design will and won't land (tester feedback:
 * "visualise the actual shape of the design surface").
 */
export const usePanelShapes = create<{
  src: string | null
  shapes: Partial<Record<PanelId, number[]>>
  setShapes: ({ src, shapes }: { src: string; shapes: Partial<Record<PanelId, number[]>> }) => void
}>()((set) => ({
  src: null,
  shapes: {},
  setShapes: ({ src, shapes }) => set({ src, shapes }),
}))

const masks = new Map<string, HTMLCanvasElement>()

/**
 * A veil over everything outside the panel's printable shape, at the
 * panel canvas's size; cached per model, panel and size.
 */
export function outsideVeil({
  src,
  panel,
  triangles,
  width,
  height,
}: {
  src: string
  panel: PanelId
  triangles: number[]
  width: number
  height: number
}): HTMLCanvasElement | null {
  const key = `${src}|${panel}|${width}x${height}`
  const cached = masks.get(key)

  if (cached) {
    return cached
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context || triangles.length === 0) {
    return null
  }

  context.fillStyle = 'rgba(26, 28, 34, 0.18)'
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = '#000'
  context.beginPath()

  for (let i = 0; i + 5 < triangles.length; i += 6) {
    context.moveTo(triangles[i]! * width, (1 - triangles[i + 1]!) * height)
    context.lineTo(triangles[i + 2]! * width, (1 - triangles[i + 3]!) * height)
    context.lineTo(triangles[i + 4]! * width, (1 - triangles[i + 5]!) * height)
    context.closePath()
  }

  context.fill()
  // A hairline round the gaps keeps slivers between triangles from showing.
  context.lineWidth = 1
  context.strokeStyle = '#000'
  context.stroke()
  masks.set(key, canvas)
  return canvas
}

/** Every panel's printable triangles in a loaded model, from its print UVs. */
export function shapesFromScene({
  scene,
  panelUv,
}: {
  scene: Object3D
  panelUv: NonNullable<DesignDocument['panelUv']>
}): Partial<Record<PanelId, number[]>> {
  const shapes: Partial<Record<PanelId, number[]>> = {}

  scene.traverse((object) => {
    const mesh = object as Mesh

    if (!mesh.isMesh || mesh.userData.printable === false) {
      return
    }

    const uv1 = mesh.geometry.getAttribute('uv1')

    if (!uv1) {
      return
    }

    const index = mesh.geometry.getIndex()

    for (const [panel, rect] of Object.entries(panelUv) as [PanelId, UvRect][]) {
      const triangles = panelTriangles({ uvs: uv1.array, index: index ? index.array : null, rect })

      if (triangles.length > 0) {
        shapes[panel] = [...(shapes[panel] ?? []), ...triangles]
      }
    }
  })

  return shapes
}
