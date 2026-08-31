import { describe, expect, test } from 'vitest'

function glbJson({ bytes }: { bytes: Uint8Array }) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkLength = view.getUint32(12, true)
  const jsonBytes = bytes.subarray(20, 20 + chunkLength)
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    nodes?: { name?: string }[]
  }
}

describe('garment.glb', () => {
  test('keeps pickable names after compression', async () => {
    const { readFileSync } = (await import(
      // @ts-expect-error Node built-in; tests run in Vitest, not the browser bundle
      'node:fs'
    )) as { readFileSync: (path: string) => Uint8Array }
    const { resolve } = (await import(
      // @ts-expect-error Node built-in
      'node:path'
    )) as { resolve: (...parts: string[]) => string }
    const cwd = (
      globalThis as unknown as { process: { cwd: () => string } }
    ).process.cwd()
    const bytes = readFileSync(resolve(cwd, 'public/models/garment.glb'))
    const names = (glbJson({ bytes }).nodes ?? []).map((node) => node.name)

    expect(names).toEqual(
      expect.arrayContaining(['body', 'collar', 'lining', 'hardware']),
    )
  })
})
