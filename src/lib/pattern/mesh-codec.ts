import type { DrapedMesh } from '../cloth/drape-job.ts'

/**
 * FLPM v1: a draped pattern mesh as stored (`pattern_meshes`), about 40 KB
 * for a tee. Little-endian:
 *
 *   0  "FLPM"            magic
 *   4  u16 format        1
 *   6  u16 solver        SOLVER_VERSION that draped it
 *   8  32 bytes          pattern hash (raw SHA-256)
 *  40  u32 vertices
 *  44  u32 indices
 *  48  u16 pieces
 *  50  u16 flags         bit 0: settled
 *  52  f32 × 6           bounds min xyz, max xyz (metres)
 *  76  f32 seconds       simulated
 *  80  piece ids         u8 length + UTF-8 each, padded to 4
 *      u16 × 3 × V       positions, quantised within the bounds
 *      i8 × 2 × V        normals, octahedral
 *      i16 × 2 × V       flat position on the piece, 0.1 mm
 *      u8 × V            piece index, padded to 4
 *      u16 or u32 × I    indices (u16 when V ≤ 65536)
 *
 * The server reads only the header (`readMeshHeader`) to check an upload
 * is what it says; the studio and share page decode the rest.
 */
export const MESH_FORMAT = 1
export const MESH_MAX_BYTES = 1024 * 1024
const MAGIC = [0x46, 0x4c, 0x50, 0x4d]
const HEADER_BYTES = 80

export type MeshHeader = {
  format: number
  solverVersion: number
  patternHash: `sha256:${string}`
  vertices: number
  indices: number
  pieces: number
  settled: boolean
}

function hexToBytes(hash: string) {
  const hex = hash.replace(/^sha256:/, '')
  const bytes = new Uint8Array(32)

  for (let i = 0; i < 32; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }

  return bytes
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const pad4 = (n: number) => (n + 3) & ~3

function octEncode(x: number, y: number, z: number): [number, number] {
  const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1
  let u = x / l1
  let v = y / l1

  if (z < 0) {
    const pu = u
    u = (1 - Math.abs(v)) * (pu >= 0 ? 1 : -1)
    v = (1 - Math.abs(pu)) * (v >= 0 ? 1 : -1)
  }

  return [Math.round(u * 127), Math.round(v * 127)]
}

function octDecode(a: number, b: number): [number, number, number] {
  let x = a / 127
  let y = b / 127
  const z = 1 - Math.abs(x) - Math.abs(y)

  if (z < 0) {
    const px = x
    x = (1 - Math.abs(y)) * (px >= 0 ? 1 : -1)
    y = (1 - Math.abs(px)) * (y >= 0 ? 1 : -1)
  }

  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

export function encodeMesh({ mesh, patternHash }: { mesh: DrapedMesh; patternHash: string }): Uint8Array {
  const vertices = mesh.positions.length / 3
  const indexCount = mesh.indices.length
  const wide = vertices > 65536
  const ids = mesh.pieceIds.map((id) => new TextEncoder().encode(id))
  const idsBytes = pad4(ids.reduce((sum, id) => sum + 1 + id.length, 0))
  const size =
    HEADER_BYTES + idsBytes + vertices * 6 + vertices * 2 + vertices * 4 + pad4(vertices) + indexCount * (wide ? 4 : 2)
  const buffer = new ArrayBuffer(pad4(size))
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, mesh.positions[i + k]!)
      max[k] = Math.max(max[k]!, mesh.positions[i + k]!)
    }
  }

  bytes.set(MAGIC, 0)
  view.setUint16(4, MESH_FORMAT, true)
  view.setUint16(6, mesh.solverVersion, true)
  bytes.set(hexToBytes(patternHash), 8)
  view.setUint32(40, vertices, true)
  view.setUint32(44, indexCount, true)
  view.setUint16(48, ids.length, true)
  view.setUint16(50, mesh.settled ? 1 : 0, true)

  for (let k = 0; k < 3; k += 1) {
    view.setFloat32(52 + k * 4, min[k]!, true)
    view.setFloat32(64 + k * 4, max[k]!, true)
  }

  view.setFloat32(76, mesh.seconds, true)
  let at = HEADER_BYTES

  for (const id of ids) {
    bytes[at] = id.length
    bytes.set(id, at + 1)
    at += 1 + id.length
  }

  at = HEADER_BYTES + idsBytes

  for (let i = 0; i < vertices * 3; i += 1) {
    const k = i % 3
    const span = max[k]! - min[k]! || 1
    view.setUint16(at, Math.round(((mesh.positions[i]! - min[k]!) / span) * 65535), true)
    at += 2
  }

  for (let i = 0; i < vertices; i += 1) {
    const [a, b] = octEncode(mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!)
    view.setInt8(at, a)
    view.setInt8(at + 1, b)
    at += 2
  }

  for (let i = 0; i < vertices * 2; i += 1) {
    view.setInt16(at, Math.max(-32768, Math.min(32767, Math.round(mesh.flat[i]! * 10))), true)
    at += 2
  }

  bytes.set(mesh.pieceOf.length ? Uint8Array.from(mesh.pieceOf) : new Uint8Array(0), at)
  at += pad4(vertices)

  for (let i = 0; i < indexCount; i += 1) {
    if (wide) {
      view.setUint32(at, mesh.indices[i]!, true)
      at += 4
    } else {
      view.setUint16(at, mesh.indices[i]!, true)
      at += 2
    }
  }

  return bytes
}

export type HeaderResult = { ok: true; header: MeshHeader; expectedBytes: number } | { ok: false; reason: string }

/** The header alone, checked against the file's length: what the server needs to accept an upload. */
export function readMeshHeader(bytes: Uint8Array): HeaderResult {
  if (bytes.length < HEADER_BYTES || bytes.length > MESH_MAX_BYTES) {
    return { ok: false, reason: 'size' }
  }

  if (MAGIC.some((byte, i) => bytes[i] !== byte)) {
    return { ok: false, reason: 'magic' }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const format = view.getUint16(4, true)

  if (format !== MESH_FORMAT) {
    return { ok: false, reason: 'format' }
  }

  const vertices = view.getUint32(40, true)
  const indices = view.getUint32(44, true)
  const pieces = view.getUint16(48, true)

  if (vertices === 0 || indices === 0 || indices % 3 !== 0 || pieces === 0 || pieces > 255) {
    return { ok: false, reason: 'counts' }
  }

  let at = HEADER_BYTES

  for (let p = 0; p < pieces; p += 1) {
    if (at >= bytes.length) {
      return { ok: false, reason: 'pieces' }
    }

    at += 1 + bytes[at]!
  }

  const expected = pad4(pad4(at) + vertices * 12 + pad4(vertices) + indices * (vertices > 65536 ? 4 : 2))

  if (bytes.length !== expected) {
    return { ok: false, reason: 'length' }
  }

  return {
    ok: true,
    expectedBytes: expected,
    header: {
      format,
      solverVersion: view.getUint16(6, true),
      patternHash: `sha256:${bytesToHex(bytes.subarray(8, 40))}`,
      vertices,
      indices,
      pieces,
      settled: (view.getUint16(50, true) & 1) === 1,
    },
  }
}

export function decodeMesh(bytes: Uint8Array): DrapedMesh {
  const read = readMeshHeader(bytes)

  if (!read.ok) {
    throw new Error(`Not a stored mesh (${read.reason})`)
  }

  const { header } = read
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const min = [view.getFloat32(52, true), view.getFloat32(56, true), view.getFloat32(60, true)]
  const max = [view.getFloat32(64, true), view.getFloat32(68, true), view.getFloat32(72, true)]
  const pieceIds: string[] = []
  let at = HEADER_BYTES

  for (let p = 0; p < header.pieces; p += 1) {
    const length = bytes[at]!
    pieceIds.push(new TextDecoder().decode(bytes.subarray(at + 1, at + 1 + length)))
    at += 1 + length
  }

  at = pad4(at)
  const v = header.vertices
  const positions = new Float32Array(v * 3)

  for (let i = 0; i < v * 3; i += 1) {
    const k = i % 3
    positions[i] = min[k]! + (view.getUint16(at, true) / 65535) * (max[k]! - min[k]!)
    at += 2
  }

  const normals = new Float32Array(v * 3)

  for (let i = 0; i < v; i += 1) {
    const [x, y, z] = octDecode(view.getInt8(at), view.getInt8(at + 1))
    normals[i * 3] = x
    normals[i * 3 + 1] = y
    normals[i * 3 + 2] = z
    at += 2
  }

  const flat = new Float32Array(v * 2)

  for (let i = 0; i < v * 2; i += 1) {
    flat[i] = view.getInt16(at, true) / 10
    at += 2
  }

  const pieceOf = Uint16Array.from(bytes.subarray(at, at + v))
  at += pad4(v)
  const indices = new Uint32Array(header.indices)

  for (let i = 0; i < header.indices; i += 1) {
    if (v > 65536) {
      indices[i] = view.getUint32(at, true)
      at += 4
    } else {
      indices[i] = view.getUint16(at, true)
      at += 2
    }

    if (indices[i]! >= v) {
      throw new Error('Not a stored mesh (index)')
    }
  }

  return {
    positions,
    normals,
    indices,
    flat,
    pieceOf,
    pieceIds,
    solverVersion: header.solverVersion,
    settled: header.settled,
    seconds: view.getFloat32(76, true),
  }
}
