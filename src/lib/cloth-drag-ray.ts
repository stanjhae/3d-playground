import { Plane, Triangle, Vector2, Vector3, type Intersection, type Mesh, type Ray } from 'three'

import type { PanelId } from './design-document'
import type { UvRect } from './panel-uv'
import { uvToPanelPoint } from './panel-uv'

/**
 * Where a graphic dragged on the 3D cloth goes when the pointer is not over
 * its own printed panel (S-B, drag-and-drop). The last triangle the pointer
 * crossed on the panel is kept as an anchor: off the cloth, over a seam
 * strip or the collar, the ray meets that triangle's plane and its print UV
 * is carried on from there, so the drag keeps following the pointer instead
 * of freezing. A hit on another panel next to that point is the drag
 * crossing onto it; one far behind (the back, seen through the collar) is
 * not, and the plane is used instead, so the mark never jumps.
 */

export type ClothAnchor = {
  plane: Plane
  a: Vector3
  b: Vector3
  c: Vector3
  ta: Vector2
  tb: Vector2
  tc: Vector2
  /** Where the pointer last was on the dragged panel, in world space. */
  point: Vector3
}

/** World distance (metres) within which a hit on another panel is a seam crossing. */
export const CROSS_REACH = 0.08

/** The print UV of a hit, or null where nothing prints (strips, trim). */
export function hitUv({ hit, printUv }: { hit: Intersection; printUv: boolean }) {
  if (hit.object.userData.printable === false) {
    return null
  }

  const uv = printUv ? hit.uv1 : hit.uv
  return uv && uv.x >= 0 && uv.y >= 0 ? { u: uv.x, v: uv.y } : null
}

export function anchorFromHit({ hit, printUv }: { hit: Intersection; printUv: boolean }): ClothAnchor | null {
  const mesh = hit.object as Mesh
  const face = hit.face

  if (!mesh.isMesh || !face) {
    return null
  }

  const uv = mesh.geometry.getAttribute(printUv ? 'uv1' : 'uv')

  if (!uv) {
    return null
  }

  const corner = (index: number) => mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld)
  const a = corner(face.a)
  const b = corner(face.b)
  const c = corner(face.c)
  const plane = new Plane().setFromCoplanarPoints(a, b, c)

  if (!Number.isFinite(plane.constant) || plane.normal.lengthSq() < 0.5) {
    return null
  }

  return {
    plane,
    a,
    b,
    c,
    ta: new Vector2(uv.getX(face.a), uv.getY(face.a)),
    tb: new Vector2(uv.getX(face.b), uv.getY(face.b)),
    tc: new Vector2(uv.getX(face.c), uv.getY(face.c)),
    point: hit.point.clone(),
  }
}

/** The ray's print UV on the anchor's plane, carried on past its triangle; null if it misses the plane. */
export function uvOnAnchor({ anchor, ray }: { anchor: ClothAnchor; ray: Ray }) {
  const point = ray.intersectPlane(anchor.plane, new Vector3())

  if (!point) {
    return null
  }

  const weights = Triangle.getBarycoord(point, anchor.a, anchor.b, anchor.c, new Vector3())

  if (!weights) {
    return null
  }

  return {
    point,
    u: anchor.ta.x * weights.x + anchor.tb.x * weights.y + anchor.tc.x * weights.z,
    v: anchor.ta.y * weights.x + anchor.tb.y * weights.y + anchor.tc.y * weights.z,
  }
}

/** A UV as a position on `panel`, not clamped, so a drag past the edge keeps its offset. */
export function uvOnPanelFree({ panel, u, v, rects }: { panel: PanelId; u: number; v: number; rects: Record<PanelId, UvRect> }) {
  const rect = rects[panel]
  const width = rect.u1 - rect.u0
  const height = rect.v1 - rect.v0
  return { x: width === 0 ? 0 : (u - rect.u0) / width, y: height === 0 ? 0 : (v - rect.v0) / height }
}

export type ClothDragStep =
  /** The pointer is on the dragged panel, or carried on past it. */
  | { kind: 'same'; x: number; y: number; anchor: ClothAnchor | null }
  /** The drag crossed a seam onto another panel. */
  | { kind: 'cross'; panel: PanelId; x: number; y: number; anchor: ClothAnchor | null }
  | { kind: 'none' }

/**
 * Where one pointer move puts the drag: the nearest cloth hit when it is on
 * the dragged panel or a seam away from it, else the anchor's plane.
 */
export function clothDragStep({
  hits,
  ray,
  panel,
  anchor,
  printUv,
  rects,
}: {
  hits: Intersection[]
  ray: Ray
  panel: PanelId
  anchor: ClothAnchor | null
  printUv: boolean
  rects: Record<PanelId, UvRect>
}): ClothDragStep {
  const hit = hits[0]
  const uv = hit ? hitUv({ hit, printUv }) : null
  const onPanel = uv ? uvToPanelPoint({ u: uv.u, v: uv.v, rects }) : null
  const carried = anchor ? uvOnAnchor({ anchor, ray }) : null

  if (hit && uv && onPanel) {
    const next = anchorFromHit({ hit, printUv })

    if (onPanel.panel === panel) {
      return { kind: 'same', ...uvOnPanelFree({ panel, u: uv.u, v: uv.v, rects }), anchor: next ?? anchor }
    }

    const near =
      !anchor ||
      hit.point.distanceTo(anchor.point) < CROSS_REACH ||
      (carried !== null && hit.point.distanceTo(carried.point) < CROSS_REACH)

    if (near) {
      return { kind: 'cross', panel: onPanel.panel, x: onPanel.x, y: onPanel.y, anchor: next ?? anchor }
    }
  }

  if (!anchor || !carried) {
    return { kind: 'none' }
  }

  // The anchor stays where the pointer last was on the cloth.
  return { kind: 'same', ...uvOnPanelFree({ panel, u: carried.u, v: carried.v, rects }), anchor }
}
