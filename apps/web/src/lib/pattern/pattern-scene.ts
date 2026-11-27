import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Uint32BufferAttribute } from 'three'

import { BODY_LANDMARKS } from '../cloth/colliders.ts'
import type { DrapedMesh } from '../cloth/drape-job.ts'
import type { PanelId, PatternRender } from '../design-document.ts'
import { resolveTemplate } from '../template-manifest.ts'
import { expandPieces } from './mirror.ts'
import type { CanonicalPattern } from './pattern-document.ts'
import { patternTemplateFor } from './templates.ts'

type UvRect = { u0: number; v0: number; u1: number; v1: number }

/** How many millimetres one repeat of a fabric map covers. */
const FABRIC_REPEAT_MM = 400

/**
 * Where the drape (made on the mannequin, shoulders at 1.44 m) stands in
 * the garment model's own frame: its template's collar meets the top of the
 * model, centred on it. Fixed per template, so lengthening a hem doesn't
 * move the shoulders, and the camera, try-on seat and tabs carry on as they
 * are for the model.
 */
export function patternSeat({ pattern }: { pattern: CanonicalPattern }): [number, number, number] {
  const template = patternTemplateFor({ templateId: pattern.basis.templateId, templateVersion: pattern.basis.templateVersion })
  const resolved = resolveTemplate({ id: pattern.basis.templateId, version: pattern.basis.templateVersion })
  const bounds = resolved.ok ? resolved.manifest.geometry.bounds : undefined

  if (!template || !bounds) {
    return [0, 0, 0]
  }

  const front = template.pattern.pieces.find((piece) => piece.place.anchor === 'front') ?? template.pattern.pieces[0]!
  const top = Math.max(...(front.outline ?? []).map((point) => point.y)) + front.place.offset[1]
  const collar = BODY_LANDMARKS.shoulderY + top / 1000
  return [(bounds.min[0] + bounds.max[0]) / 2, bounds.max[1] - collar, (bounds.min[2] + bounds.max[2]) / 2]
}

/**
 * Print UVs for each vertex: its piece point, placed in its panel's frame
 * (as seen from outside, which is how render panels are drawn), inside that
 * panel's atlas rectangle. A vertex whose panel has no rectangle gets
 * (−1, −1) and takes no ink.
 */
export function patternPrintUv({
  mesh,
  render,
  panelUv,
}: {
  mesh: Pick<DrapedMesh, 'flat' | 'pieceOf' | 'pieceIds'>
  render: PatternRender
  panelUv: Partial<Record<PanelId, UvRect>>
}): Float32Array {
  const { pattern } = render
  const template = patternTemplateFor({ templateId: pattern.basis.templateId, templateVersion: pattern.basis.templateVersion })
  const frames = template?.frames ?? {}
  const pieces = new Map(expandPieces({ pattern }).map((piece) => [piece.id, piece]))
  const out = new Float32Array(mesh.pieceOf.length * 2)

  for (let i = 0; i < mesh.pieceOf.length; i += 1) {
    const piece = pieces.get(mesh.pieceIds[mesh.pieceOf[i]!]!)
    const frame = piece ? frames[piece.panel] : undefined
    const rect = piece ? panelUv[render.renderPanels[piece.panel] ?? (piece.panel as PanelId)] : undefined

    if (!piece || !frame || !rect) {
      out[i * 2] = -1
      out[i * 2 + 1] = -1
      continue
    }

    // Cloth grown past its frame (a lengthened sleeve) takes the frame's
    // edge: a print never spills into another panel's part of the atlas.
    const u = Math.min(1, Math.max(0, (piece.panelOrigin[0] + mesh.flat[i * 2]!) / frame.width))
    const v = Math.min(1, Math.max(0, (piece.panelOrigin[1] + mesh.flat[i * 2 + 1]!) / frame.height))
    out[i * 2] = rect.u0 + u * (rect.u1 - rect.u0)
    out[i * 2 + 1] = rect.v0 + v * (rect.v1 - rect.v0)
  }

  return out
}

/**
 * The draped pattern as a scene `SeatedForm` can dress like a model: one
 * double-sided cloth mesh named `body-pattern` (so a base-colour override
 * on `body` reaches it), with print UVs in `uv1` and fabric UVs in `uv`.
 */
export function buildPatternScene({
  mesh,
  render,
  panelUv,
  color,
  roughness = 0.86,
  seat,
}: {
  mesh: DrapedMesh
  render: PatternRender
  panelUv: Partial<Record<PanelId, UvRect>>
  color: string
  roughness?: number
  /** Where the drape stands; the template's model seat by default. A bake passes [0, 0, 0] to keep the mannequin's frame. */
  seat?: readonly [number, number, number]
}): Group {
  const [sx, sy, sz] = seat ?? patternSeat({ pattern: render.pattern })
  const positions = new Float32Array(mesh.positions.length)

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = mesh.positions[i]! + sx
    positions[i + 1] = mesh.positions[i + 1]! + sy
    positions[i + 2] = mesh.positions[i + 2]! + sz
  }

  const fabricUv = new Float32Array(mesh.flat.length)

  for (let i = 0; i < fabricUv.length; i += 1) {
    fabricUv[i] = mesh.flat[i]! / FABRIC_REPEAT_MM
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(fabricUv, 2))
  geometry.setAttribute('uv1', new Float32BufferAttribute(patternPrintUv({ mesh, render, panelUv }), 2))
  geometry.setIndex(new Uint32BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const material = new MeshStandardMaterial({ color, roughness, metalness: 0, side: DoubleSide })
  const cloth = new Mesh(geometry, material)
  cloth.name = 'body-pattern'
  cloth.castShadow = true
  cloth.receiveShadow = true

  const root = new Group()
  root.name = 'pattern-garment'
  root.add(cloth)
  return root
}
