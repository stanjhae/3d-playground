import { mkdirSync, writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { type ClothPiece, type ClothSeam, buildCloth } from '../pattern/build-cloth'
import { BODY_LANDMARKS, armAxis, bodyColliders } from './colliders'
import { simulateCloth } from './solver'

const SPIKE = process.env.CLOTH_SPIKE === '1'

const bodice = (neckDip: number) => [
  { id: 'hemL', x: -260, y: 0 },
  { id: 'hemR', x: 260, y: 0 },
  { id: 'armR', x: 255, y: 440 },
  { id: 'armRm', x: 205, y: 520 },
  { id: 'shR', x: 175, y: 640 },
  { id: 'neckR', x: 78, y: 680 },
  { id: 'neckRm', x: 50, y: neckDip + 25 },
  { id: 'neckC', x: 0, y: neckDip },
  { id: 'neckLm', x: -50, y: neckDip + 25 },
  { id: 'neckL', x: -78, y: 680 },
  { id: 'shL', x: -175, y: 640 },
  { id: 'armLm', x: -205, y: 520 },
  { id: 'armL', x: -255, y: 440 },
]

const sleeve = [
  { id: 'cuffL', x: -175, y: 0 },
  { id: 'cuffR', x: 175, y: 0 },
  { id: 'capR', x: 215, y: 180 },
  { id: 'capRm', x: 120, y: 225 },
  { id: 'capMid', x: 0, y: 245 },
  { id: 'capLm', x: -120, y: 225 },
  { id: 'capL', x: -215, y: 180 },
]

const DEPTH = 0.1
const topY = BODY_LANDMARKS.shoulderY - 0.64

function plane(facing: 1 | -1) {
  return ([x, y]: readonly [number, number]) => [(facing * x) / 1000, topY + y / 1000, facing * DEPTH] as const
}

function wrapSleeve(sign: 1 | -1) {
  const { origin, dir, out } = armAxis(sign)

  return ([x, y]: readonly [number, number]) => {
    const half = 175 + ((215 - 175) * Math.min(y, 180)) / 180
    const t = Math.max(-1, Math.min(1, x / half))
    // Cap middle on top of the arm, its two corners meeting underneath.
    const phi = sign > 0 ? -Math.PI * t : Math.PI * t
    const radius = (half * 2) / (2 * Math.PI) / 1000 + 0.012
    const along = 0.03 + (245 - y) / 1000
    const cx = origin[0] + dir[0] * along
    const cy = origin[1] + dir[1] * along
    return [cx + radius * Math.cos(phi) * out[0], cy + radius * Math.cos(phi) * out[1], radius * Math.sin(phi)] as const
  }
}

export const SPIKE_TEE_PIECES: ClothPiece[] = [
  { id: 'front', outline: bodice(590), place: plane(1) },
  { id: 'back', outline: bodice(655), place: plane(-1) },
  { id: 'sleeveR', outline: sleeve, place: wrapSleeve(1) },
  { id: 'sleeveL', outline: sleeve, place: wrapSleeve(-1) },
]

export const SPIKE_TEE_SEAMS: ClothSeam[] = [
  { id: 'sideR', a: { piece: 'front', from: 'hemR', to: 'armR' }, b: { piece: 'back', from: 'armL', to: 'hemL' } },
  { id: 'sideL', a: { piece: 'front', from: 'armL', to: 'hemL' }, b: { piece: 'back', from: 'hemR', to: 'armR' } },
  { id: 'shoulderR', a: { piece: 'front', from: 'shR', to: 'neckR' }, b: { piece: 'back', from: 'neckL', to: 'shL' } },
  { id: 'shoulderL', a: { piece: 'front', from: 'neckL', to: 'shL' }, b: { piece: 'back', from: 'shR', to: 'neckR' } },
  { id: 'capFrontR', a: { piece: 'front', from: 'armR', to: 'shR' }, b: { piece: 'sleeveR', from: 'capMid', to: 'capL' } },
  { id: 'capBackR', a: { piece: 'back', from: 'shL', to: 'armL' }, b: { piece: 'sleeveR', from: 'capR', to: 'capMid' } },
  { id: 'capFrontL', a: { piece: 'front', from: 'shL', to: 'armL' }, b: { piece: 'sleeveL', from: 'capR', to: 'capMid' } },
  { id: 'capBackL', a: { piece: 'back', from: 'armR', to: 'shR' }, b: { piece: 'sleeveL', from: 'capMid', to: 'capL' } },
  { id: 'underR', a: { piece: 'sleeveR', from: 'cuffR', to: 'capR' }, b: { piece: 'sleeveR', from: 'capL', to: 'cuffL' } },
  { id: 'underL', a: { piece: 'sleeveL', from: 'cuffR', to: 'capR' }, b: { piece: 'sleeveL', from: 'capL', to: 'cuffL' } },
]

describe.skipIf(!SPIKE)('cloth spike: drape a tee', () => {
  it('drapes and settles', () => {
    for (const spacing of [35, 25, 20]) {
      const built = buildCloth({ pieces: SPIKE_TEE_PIECES, seams: SPIKE_TEE_SEAMS, colliders: bodyColliders(), spacing })
      const started = performance.now()
      const result = simulateCloth(built.input, { maxSeconds: 5 })
      const ms = performance.now() - started
      const particles = built.input.positions.length / 3

      console.log(
        `spacing ${spacing}mm: ${particles} particles, ${built.triangles.length / 3} triangles, ${built.input.links.length / 2} links, ${built.input.stitches.length / 2} stitches → ${ms.toFixed(0)} ms for ${result.seconds.toFixed(2)} s simulated (settled ${result.settled}), stitch gap ${(result.stitchGap * 1000).toFixed(2)} mm`,
      )

      mkdirSync('public/spike', { recursive: true })
      writeFileSync(
        `public/spike/tee-${spacing}.json`,
        JSON.stringify({
          start: Array.from(built.input.positions, (v) => +v.toFixed(5)),
          positions: Array.from(result.positions, (v) => +v.toFixed(5)),
          triangles: Array.from(built.triangles),
          pieceOf: Array.from(built.pieceOf),
          colliders: built.input.colliders,
        }),
      )
      expect(result.stitchGap).toBeLessThan(0.01)
    }
  }, 120_000)
})
