import { describe, expect, test } from 'vitest'

function glbJson({ bytes }: { bytes: Uint8Array }) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkLength = view.getUint32(12, true)
  const jsonBytes = bytes.subarray(20, 20 + chunkLength)
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    accessors?: { max?: number[]; min?: number[]; type?: string }[]
    asset?: {
      extras?: { author?: string; license?: string; title?: string }
    }
    materials?: { alphaMode?: string }[]
    nodes?: {
      name?: string
      mesh?: number
      matrix?: number[]
      translation?: number[]
      rotation?: number[]
      scale?: number[]
    }[]
  }
}

async function readGlb({ path }: { path: string }) {
  const { readFileSync } = (await import(
    // @ts-expect-error Node built-in; tests run in Vitest, not the browser bundle
    'node:fs'
  )) as { readFileSync: (filePath: string) => Uint8Array }
  const { resolve } = (await import(
    // @ts-expect-error Node built-in
    'node:path'
  )) as { resolve: (...parts: string[]) => string }
  const cwd = (
    globalThis as unknown as { process: { cwd: () => string } }
  ).process.cwd()
  return readFileSync(resolve(cwd, path))
}

function composeNodeMatrix({
  node,
}: {
  node: {
    matrix?: number[]
    translation?: number[]
    rotation?: number[]
    scale?: number[]
  }
}) {
  if (node.matrix) {
    return node.matrix
  }

  const [tx = 0, ty = 0, tz = 0] = node.translation ?? []
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? []
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? []
  const xx = qx * qx
  const yy = qy * qy
  const zz = qz * qz
  const xy = qx * qy
  const xz = qx * qz
  const yz = qy * qz
  const wx = qw * qx
  const wy = qw * qy
  const wz = qw * qz

  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ]
}

function transformPoint({
  matrix,
  x,
  y,
  z,
}: {
  matrix: number[]
  x: number
  y: number
  z: number
}) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  }
}

function heightBounds({
  json,
}: {
  json: ReturnType<typeof glbJson>
}) {
  const matrix = composeNodeMatrix({
    node: json.nodes?.[0] ?? {},
  })
  const positions = (json.accessors ?? []).filter(
    (accessor) => accessor.type === 'VEC3' && accessor.min && accessor.max,
  )
  let yMin = Number.POSITIVE_INFINITY
  let yMax = Number.NEGATIVE_INFINITY

  for (const accessor of positions) {
    const [minX = 0, minY = 0, minZ = 0] = accessor.min ?? []
    const [maxX = 0, maxY = 0, maxZ = 0] = accessor.max ?? []

    for (const x of [minX, maxX]) {
      for (const y of [minY, maxY]) {
        for (const z of [minZ, maxZ]) {
          const world = transformPoint({ matrix, x, y, z })
          yMin = Math.min(yMin, world.y)
          yMax = Math.max(yMax, world.y)
        }
      }
    }
  }

  return { yMin, yMax }
}

describe('garment.glb', () => {
  test('keeps the credited evening-wear hero pickable and framed', async () => {
    const bytes = await readGlb({ path: 'public/models/garment.glb' })
    const json = glbJson({ bytes })
    const nodes = json.nodes ?? []
    const names = nodes.map((node) => node.name)
    const meshNames = nodes
      .filter((node) => node.mesh !== undefined)
      .map((node) => node.name ?? '')
    const { yMin, yMax } = heightBounds({ json })
    const matrix = nodes[0]?.matrix ?? []
    const scale = Math.hypot(matrix[0] ?? 0, matrix[1] ?? 0, matrix[2] ?? 0)

    expect(json.asset?.extras?.author).toMatch(/Style3D/)
    expect(json.asset?.extras?.title).toBe('White Evening Gown Dress')
    expect(json.asset?.extras?.license).toMatch(/CC-BY-4.0/)
    expect(json.materials?.[0]?.alphaMode).toBe('OPAQUE')
    expect(names).toEqual(expect.arrayContaining(['body']))
    expect(meshNames.length).toBeGreaterThan(1)
    expect(meshNames.every((name) => /^body(?:-.+)?$/.test(name))).toBe(true)
    expect(scale).toBeGreaterThan(0.001)
    expect(scale).toBeLessThan(0.003)
    expect(matrix[13]).toBeLessThan(0)
    expect(yMin).toBeGreaterThanOrEqual(-0.05)
    expect(yMax).toBeGreaterThan(1.4)
    expect(yMax).toBeLessThan(2.2)
    expect(bytes.byteLength).toBeLessThan(1_500_000)
  })

  test('jacket keeps the same fashion panel names', async () => {
    const bytes = await readGlb({ path: 'public/models/jacket.glb' })
    const names = (glbJson({ bytes }).nodes ?? []).map((node) => node.name)

    expect(names).toEqual(
      expect.arrayContaining(['body', 'collar', 'lining', 'hardware']),
    )
  })
})

async function expectSeatedStyle3d({
  path,
  title,
  parts,
}: {
  path: string
  title: string
  parts: string[]
}) {
  const bytes = await readGlb({ path })
  const json = glbJson({ bytes })
  const meshNames = (json.nodes ?? [])
    .filter((node) => node.mesh !== undefined)
    .map((node) => node.name ?? '')
  const { yMin, yMax } = heightBounds({ json })

  expect(json.asset?.extras?.author).toMatch(/Style3D/)
  expect(json.asset?.extras?.title).toBe(title)
  expect(json.asset?.extras?.license).toMatch(/CC-BY-4.0/)
  expect(meshNames.some((name) => name === 'body' || name.startsWith('body-'))).toBe(
    true,
  )
  for (const part of parts) {
    expect(meshNames.some((name) => name === part || name.startsWith(`${part}-`))).toBe(
      true,
    )
  }
  expect(yMin).toBeGreaterThanOrEqual(-0.08)
  expect(yMax).toBeGreaterThan(1.2)
  expect(yMax).toBeLessThan(2.3)
  expect(bytes.byteLength).toBeLessThan(1_500_000)
}

describe('house forms', () => {
  test('slip is credited and framed', async () => {
    await expectSeatedStyle3d({
      path: 'public/models/slip.glb',
      title: 'Black Dress',
      parts: ['body'],
    })
  })

  test('shirt and skirt expose two panels', async () => {
    await expectSeatedStyle3d({
      path: 'public/models/mixed.glb',
      title: 'White shirt black leather skirt outfit',
      parts: ['body', 'skirt'],
    })
  })

  test('coat keeps tailoring panels', async () => {
    await expectSeatedStyle3d({
      path: 'public/models/coat.glb',
      title: 'Black jacket coat',
      parts: ['body', 'hardware'],
    })
  })

  test('suit keeps tailoring panels', async () => {
    await expectSeatedStyle3d({
      path: 'public/models/suit.glb',
      title: 'White Suit Set',
      parts: ['body', 'hardware'],
    })
  })
})
