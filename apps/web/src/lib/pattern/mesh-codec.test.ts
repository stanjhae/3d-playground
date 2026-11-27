import { describe, expect, test } from 'vitest'

import { type DrapeMessage, type DrapedMesh, runDrapeJob } from '../cloth/drape-job'
import { MESH_MAX_BYTES, decodeMesh, encodeMesh, readMeshHeader } from './mesh-codec'
import { createEmptyCanonicalDocument } from '../canonical-document'
import { toRenderDocument } from '../render-projection'
import { fixtureTeePattern } from './pattern-fixtures'
import { hashPattern } from './pattern-hash'
import { applyPatternOps } from './pattern-ops'
import { patternPrintUv } from './pattern-scene'
import { patternTemplateFor } from './templates'

let draped: DrapedMesh | null = null

function drape() {
  if (!draped) {
    const messages: DrapeMessage[] = []
    runDrapeJob({ type: 'drape', job: 1, pattern: fixtureTeePattern() }, (message) => messages.push(message))
    const done = messages.at(-1)!
    draped = done.type === 'done' ? done.mesh : null
  }

  return draped!
}

describe('stored meshes (FLPM v1)', () => {
  test('round-trips a drape closely, in well under the size limit', async () => {
    const mesh = drape()
    const patternHash = await hashPattern({ pattern: fixtureTeePattern() })
    const bytes = encodeMesh({ mesh, patternHash })
    expect(bytes.length).toBeLessThan(60_000)
    expect(bytes.length).toBeLessThan(MESH_MAX_BYTES)

    const header = readMeshHeader(bytes)
    expect(header.ok && header.header).toEqual({
      format: 1,
      solverVersion: mesh.solverVersion,
      patternHash,
      vertices: mesh.positions.length / 3,
      indices: mesh.indices.length,
      pieces: 4,
      settled: true,
    })

    const back = decodeMesh(bytes)
    expect(back.pieceIds).toEqual(mesh.pieceIds)
    expect(Array.from(back.indices)).toEqual(Array.from(mesh.indices))
    expect(Array.from(back.pieceOf)).toEqual(Array.from(mesh.pieceOf))
    expect(back.seconds).toBeCloseTo(mesh.seconds, 4)

    let positionError = 0
    let normalError = 0
    let flatError = 0

    for (let i = 0; i < mesh.positions.length; i += 1) {
      positionError = Math.max(positionError, Math.abs(back.positions[i]! - mesh.positions[i]!))
      normalError = Math.max(normalError, Math.abs(back.normals[i]! - mesh.normals[i]!))
    }

    for (let i = 0; i < mesh.flat.length; i += 1) {
      flatError = Math.max(flatError, Math.abs(back.flat[i]! - mesh.flat[i]!))
    }

    // Under 0.1 mm on the body, a few degrees on a normal, 0.05 mm on the piece.
    expect(positionError).toBeLessThan(0.0001)
    expect(normalError).toBeLessThan(0.05)
    expect(flatError).toBeLessThan(0.051)
  }, 20_000)

  test('a drape with a cut-out round-trips too, and every vertex prints inside its panel', async () => {
    const template = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!
    const cut = applyPatternOps({ pattern: template.pattern, ops: [{ op: 'cutout', piece: 'back', shape: 'teardrop', dx: 0, dy: 60, wMm: 90, hMm: 140 }] })
    expect(cut.ok).toBe(true)

    if (!cut.ok) {
      return
    }

    const messages: DrapeMessage[] = []
    runDrapeJob({ type: 'drape', job: 2, pattern: cut.pattern }, (message) => messages.push(message))
    const done = messages.at(-1)!
    expect(done.type).toBe('done')
    const mesh = (done as Extract<DrapeMessage, { type: 'done' }>).mesh
    const patternHash = await hashPattern({ pattern: cut.pattern })
    const back = decodeMesh(encodeMesh({ mesh, patternHash }))
    expect(Array.from(back.indices)).toEqual(Array.from(mesh.indices))
    expect(Array.from(back.pieceOf)).toEqual(Array.from(mesh.pieceOf))
    expect(back.positions.every((value, i) => Math.abs(value - mesh.positions[i]!) < 0.0001)).toBe(true)

    const render = toRenderDocument({ document: { ...createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 4 }), pattern: cut.pattern } }).document
    const uv = patternPrintUv({ mesh: back, render: render.pattern!, panelUv: render.panelUv! })

    for (let i = 0; i < back.pieceOf.length; i += 1) {
      const panel = render.pattern!.renderPanels[cut.pattern.pieces.find((piece) => piece.id === back.pieceIds[back.pieceOf[i]!])!.panel]!
      const rect = render.panelUv![panel]!
      expect(uv[i * 2]!).toBeGreaterThanOrEqual(Math.min(rect.u0, rect.u1) - 1e-6)
      expect(uv[i * 2]!).toBeLessThanOrEqual(Math.max(rect.u0, rect.u1) + 1e-6)
      expect(uv[i * 2 + 1]!).toBeGreaterThanOrEqual(Math.min(rect.v0, rect.v1) - 1e-6)
      expect(uv[i * 2 + 1]!).toBeLessThanOrEqual(Math.max(rect.v0, rect.v1) + 1e-6)
    }
  }, 20_000)

  test('anything that is not a whole FLPM file is refused by its header', async () => {
    const bytes = encodeMesh({ mesh: drape(), patternHash: await hashPattern({ pattern: fixtureTeePattern() }) })

    const wrongMagic = bytes.slice()
    wrongMagic[0] = 0x00
    expect(readMeshHeader(wrongMagic)).toEqual({ ok: false, reason: 'magic' })

    const wrongFormat = bytes.slice()
    wrongFormat[4] = 9
    expect(readMeshHeader(wrongFormat)).toEqual({ ok: false, reason: 'format' })

    expect(readMeshHeader(bytes.slice(0, bytes.length - 4))).toEqual({ ok: false, reason: 'length' })
    expect(readMeshHeader(new Uint8Array(10))).toEqual({ ok: false, reason: 'size' })
    expect(readMeshHeader(new Uint8Array(MESH_MAX_BYTES + 4))).toEqual({ ok: false, reason: 'size' })

    // A PNG is not a mesh.
    expect(readMeshHeader(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(0)])).ok).toBe(false)
  }, 20_000)

  test('an index past the vertices is caught on decode', async () => {
    const bytes = encodeMesh({ mesh: drape(), patternHash: await hashPattern({ pattern: fixtureTeePattern() }) })
    const broken = bytes.slice()
    // The last index is the final two bytes (u16).
    broken[broken.length - 1] = 0xff
    broken[broken.length - 2] = 0xff
    expect(() => decodeMesh(broken)).toThrow('index')
  }, 20_000)
})
