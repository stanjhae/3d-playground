import { Mesh, PerspectiveCamera, Vector4 } from 'three'

import type { PanelId } from './design-document'
import { type AtlasBuffer, rasterizeLayers } from './paint-atlas'
import { DEFAULT_PANEL_UV, uvToPanelPoint } from './panel-uv'
import { toRenderDocument } from './render-projection'
import type { CanonicalDocument } from './canonical-document'
import { type CameraPresetName, CAMERA_PRESET_POSITIONS, presetTarget, STILL_FRAME, STUDIO_CAMERA } from './studio-camera'
import { CURRENT_TEMPLATE } from './template-manifest'
import { createClothingMesh } from './tee-geometry'
import { PNG_SIGNATURE, concatBytes, deflate, pngChunk, pngHeader } from './image-fixtures'

/**
 * Test support (#153): what each published still shows, without WebGL.
 * A small z-buffer rasterizer draws the tee's triangles from a camera
 * preset at the 4:5 still shape, both faces (the cotton is double-sided),
 * and records per pixel which mesh is in front and the atlas UV there.
 * Tests use it to say which print regions a view can show, and to draw
 * stand-in stills from a document's atlas.
 */

export type ViewSample = { mesh: string; printable: boolean; u: number; v: number }

export type ViewMap = { width: number; height: number; samples: Array<ViewSample | null> }

export const STILL_BACKGROUND = [0xd9, 0xd8, 0xd4] as const
export const FABRIC = [0xf3, 0xef, 0xe6] as const

/** The render panel whose atlas rectangle holds `u, v`. */
export function regionAt({ u, v }: { u: number; v: number }): PanelId {
  return uvToPanelPoint({ u, v, rects: DEFAULT_PANEL_UV })!.panel
}

/** The mesh the manifest prints each render panel on. */
export const MANIFEST_MESH: Record<PanelId, string> = Object.fromEntries(
  Object.values(CURRENT_TEMPLATE.regions).map((region) => [region.renderPanel, region.mesh]),
) as Record<PanelId, string>

export function stillCamera({ preset, aspect = STILL_FRAME.width / STILL_FRAME.height }: { preset: CameraPresetName; aspect?: number }) {
  const camera = new PerspectiveCamera(STUDIO_CAMERA.fov, aspect, STUDIO_CAMERA.near, STUDIO_CAMERA.far)
  const [x, y, z] = CAMERA_PRESET_POSITIONS[preset]
  camera.position.set(x, y, z)
  camera.lookAt(...presetTarget({ preset }))
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

/** Which mesh, and which atlas UV, each pixel of a preset's still shows. */
export function rasterizeView({
  preset,
  pose = 'flat',
  width = 120,
  height = 150,
}: {
  preset: CameraPresetName
  pose?: 'flat' | 'worn'
  width?: number
  height?: number
}): ViewMap {
  const camera = stillCamera({ preset, aspect: width / height })
  const root = createClothingMesh({ pose })
  root.updateMatrixWorld(true)
  const depth = new Float32Array(width * height).fill(Infinity)
  const samples: Array<ViewSample | null> = new Array(width * height).fill(null)
  const clip = new Vector4()

  root.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return
    }

    const position = node.geometry.attributes.position!
    const uv = node.geometry.attributes.uv!
    const index = node.geometry.index
    const count = index ? index.count : position.count
    const printable = node.userData.printable !== false
    // Screen x, y, NDC depth, 1/w, u/w, v/w for each corner.
    const corner = (vertex: number) => {
      clip
        .set(position.getX(vertex), position.getY(vertex), position.getZ(vertex), 1)
        .applyMatrix4(node.matrixWorld)
        .applyMatrix4(camera.matrixWorldInverse)
        .applyMatrix4(camera.projectionMatrix)
      const w = clip.w
      return {
        x: ((clip.x / w + 1) / 2) * width,
        y: ((1 - clip.y / w) / 2) * height,
        z: clip.z / w,
        iw: 1 / w,
        uw: uv.getX(vertex) / w,
        vw: uv.getY(vertex) / w,
        front: w > 0,
      }
    }

    for (let face = 0; face < count; face += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => corner(index ? index.getX(face + offset) : face + offset))

      if (!a!.front || !b!.front || !c!.front) {
        continue
      }

      const area = (b!.x - a!.x) * (c!.y - a!.y) - (c!.x - a!.x) * (b!.y - a!.y)

      if (Math.abs(area) < 1e-12) {
        continue
      }

      const minX = Math.max(0, Math.floor(Math.min(a!.x, b!.x, c!.x)))
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a!.x, b!.x, c!.x)))
      const minY = Math.max(0, Math.floor(Math.min(a!.y, b!.y, c!.y)))
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a!.y, b!.y, c!.y)))

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5
          const py = y + 0.5
          const wa = ((b!.x - px) * (c!.y - py) - (c!.x - px) * (b!.y - py)) / area
          const wb = ((c!.x - px) * (a!.y - py) - (a!.x - px) * (c!.y - py)) / area
          const wc = 1 - wa - wb

          if (wa < 0 || wb < 0 || wc < 0) {
            continue
          }

          const z = wa * a!.z + wb * b!.z + wc * c!.z
          const pixel = y * width + x

          if (z < -1 || z > 1 || z >= depth[pixel]!) {
            continue
          }

          const iw = wa * a!.iw + wb * b!.iw + wc * c!.iw
          depth[pixel] = z
          samples[pixel] = {
            mesh: node.name,
            printable,
            u: (wa * a!.uw + wb * b!.uw + wc * c!.uw) / iw,
            v: (wa * a!.vw + wb * b!.vw + wc * c!.vw) / iw,
          }
        }
      }
    }
  })

  return { width, height, samples }
}

/** The print regions a view shows, as `mesh → render panels`. */
export function visiblePrintRegions({ view }: { view: ViewMap }) {
  const regions = new Map<string, Set<PanelId>>()

  for (const sample of view.samples) {
    if (!sample?.printable) {
      continue
    }

    const set = regions.get(sample.mesh) ?? new Set<PanelId>()
    set.add(regionAt(sample))
    regions.set(sample.mesh, set)
  }

  return regions
}

/** RGB pixels of a stand-in still: atlas ink over fabric where the print shows. */
export function drawStill({ view, atlas }: { view: ViewMap; atlas: AtlasBuffer }) {
  const rgb = new Uint8Array(view.width * view.height * 3)

  view.samples.forEach((sample, pixel) => {
    let color: readonly number[] = sample ? FABRIC : STILL_BACKGROUND

    if (sample?.printable) {
      const column = Math.min(atlas.width - 1, Math.max(0, Math.floor(sample.u * atlas.width)))
      const row = Math.min(atlas.height - 1, Math.max(0, Math.floor((1 - sample.v) * atlas.height)))
      const at = (row * atlas.width + column) * 4
      const alpha = atlas.pixels[at + 3]! / 255
      color = FABRIC.map((fabric, channel) => Math.round(atlas.pixels[at + channel]! * alpha + fabric * (1 - alpha)))
    }

    rgb.set(color, pixel * 3)
  })

  return rgb
}

/** The atlas a canonical document publishes. */
export function documentAtlas({ document, size = 512 }: { document: CanonicalDocument; size?: number }) {
  return rasterizeLayers({ document: toRenderDocument({ document }).document, width: size, height: size })
}

/** An 8-bit RGB PNG, unfiltered rows. */
export async function encodeRgbPng({ width, height, rgb }: { width: number; height: number; rgb: Uint8Array }) {
  const stride = 1 + width * 3
  const raw = new Uint8Array(stride * height)

  for (let y = 0; y < height; y += 1) {
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1)
  }

  return concatBytes([
    PNG_SIGNATURE,
    pngHeader({ width, height, colorType: 2 }),
    pngChunk({ type: 'IDAT', data: await deflate({ bytes: raw }) }),
    pngChunk({ type: 'IEND' }),
  ])
}

/** Reads back a PNG written by `encodeRgbPng` (8-bit RGB, filter 0 rows). */
export async function decodeRgbPng({ bytes }: { bytes: Uint8Array }) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const idat: Uint8Array[] = []
  let width = 0
  let height = 0

  for (let offset = 8; offset < bytes.length; ) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)

      if (data[8] !== 8 || data[9] !== 2) {
        throw new Error('expected an 8-bit RGB PNG')
      }
    }

    if (type === 'IDAT') {
      idat.push(data)
    }

    offset += 12 + length
  }

  const stream = new Blob([concatBytes(idat)]).stream().pipeThrough(new DecompressionStream('deflate'))
  const raw = new Uint8Array(await new Response(stream).arrayBuffer())
  const stride = 1 + width * 3
  const rgb = new Uint8Array(width * height * 3)

  for (let y = 0; y < height; y += 1) {
    if (raw[y * stride] !== 0) {
      throw new Error('expected unfiltered rows')
    }

    rgb.set(raw.subarray(y * stride + 1, (y + 1) * stride), y * width * 3)
  }

  return { width, height, rgb }
}
