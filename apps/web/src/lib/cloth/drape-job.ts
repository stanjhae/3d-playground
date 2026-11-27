import { clothFromPattern } from '../pattern/build-cloth.ts'
import type { CanonicalPattern } from '../pattern/pattern-document.ts'
import { type ColliderBuild, bodyColliders } from './colliders.ts'
import { SOLVER_VERSION, simulateCloth } from './solver.ts'

/**
 * One drape, start to finish, as the cloth worker runs it: build the cloth
 * from the pattern, simulate until it settles, and hand back a render-ready
 * mesh. Pure apart from `post`, so tests run it without a worker.
 */
export type DrapeRequest = {
  type: 'drape'
  job: number
  pattern: CanonicalPattern
  build?: ColliderBuild
  spacing?: number
}

export type DrapedMesh = {
  /** Metres, xyz per vertex. */
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  /** Millimetres on its piece, xy per vertex. */
  flat: Float32Array
  /** Index into `pieceIds`, per vertex. */
  pieceOf: Uint16Array
  pieceIds: string[]
  solverVersion: number
  settled: boolean
  /** Simulated seconds. */
  seconds: number
}

export type DrapeMessage =
  | { type: 'progress'; job: number; fraction: number }
  | { type: 'done'; job: number; mesh: DrapedMesh }
  | { type: 'failed'; job: number; message: string }

export const MAX_DRAPE_SECONDS = 10

/** Smooth vertex normals, area-weighted. */
export function vertexNormals(positions: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const normals = new Float32Array(positions.length)

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3
    const b = indices[t + 1]! * 3
    const c = indices[t + 2]! * 3
    const ux = positions[b]! - positions[a]!
    const uy = positions[b + 1]! - positions[a + 1]!
    const uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!
    const vy = positions[c + 1]! - positions[a + 1]!
    const vz = positions[c + 2]! - positions[a + 2]!
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx

    for (const v of [a, b, c]) {
      normals[v] = normals[v]! + nx
      normals[v + 1] = normals[v + 1]! + ny
      normals[v + 2] = normals[v + 2]! + nz
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1
    normals[i] = normals[i]! / len
    normals[i + 1] = normals[i + 1]! / len
    normals[i + 2] = normals[i + 2]! / len
  }

  return normals
}

export function runDrapeJob(request: DrapeRequest, post: (message: DrapeMessage, transfer?: Transferable[]) => void) {
  try {
    const built = clothFromPattern({ pattern: request.pattern, colliders: bodyColliders({ build: request.build }), spacing: request.spacing })
    let lastPost = -1
    const result = simulateCloth(built.input, {
      maxSeconds: MAX_DRAPE_SECONDS,
      onProgress: ({ seconds }) => {
        // About ten a second of simulated time is plenty for a progress bar.
        if (seconds - lastPost >= 0.1) {
          lastPost = seconds
          post({ type: 'progress', job: request.job, fraction: Math.min(0.99, seconds / 4) })
        }
      },
    })
    const positions = Float32Array.from(result.positions)
    const indices = Uint32Array.from(built.triangles)
    const mesh: DrapedMesh = {
      positions,
      normals: vertexNormals(positions, indices),
      indices,
      flat: Float32Array.from(built.flat),
      pieceOf: built.pieceOf,
      pieceIds: built.pieceIds,
      solverVersion: SOLVER_VERSION,
      settled: result.settled,
      seconds: result.seconds,
    }
    post({ type: 'done', job: request.job, mesh }, [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.indices.buffer,
      mesh.flat.buffer,
      mesh.pieceOf.buffer,
    ])
  } catch (error) {
    post({ type: 'failed', job: request.job, message: error instanceof Error ? error.message : 'The drape failed' })
  }
}
