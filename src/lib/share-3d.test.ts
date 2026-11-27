import { describe, expect, test } from 'vitest'

import { getPublicScene, share3dMode } from './share-3d'

describe('the share page 3D view', () => {
  test('loads by itself only where it should', () => {
    expect(share3dMode({ webgl: true, reducedMotion: false, deviceMemory: 8, cores: 8 })).toBe('auto')
    expect(share3dMode({ webgl: true, reducedMotion: false })).toBe('auto')
    expect(share3dMode({ webgl: false, reducedMotion: false })).toBe('off')
    expect(share3dMode({ webgl: false, reducedMotion: true })).toBe('off')
  })

  test('asks first under reduced motion, Save-Data or on a small device', () => {
    expect(share3dMode({ webgl: true, reducedMotion: true })).toBe('ask')
    expect(share3dMode({ webgl: true, reducedMotion: false, saveData: true })).toBe('ask')
    expect(share3dMode({ webgl: true, reducedMotion: false, deviceMemory: 2 })).toBe('ask')
    expect(share3dMode({ webgl: true, reducedMotion: false, cores: 2 })).toBe('ask')
  })

  test('reads the scene of the version the stills show, and nothing else', async () => {
    const asked: string[] = []
    const reply = (body: unknown, status = 200) =>
      (async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify(body), { status })
      }) as unknown as typeof fetch

    const scene = { seq: 4, document: { panels: {} }, assets: {} }
    expect(await getPublicScene({ slug: 'abc', seq: 4, fetchImpl: reply(scene) })).toEqual({ ok: true, scene })
    expect(asked).toEqual(['/api/flp/public/abc/scene?seq=4'])
    // A republish in between: the stills are of another version.
    expect(await getPublicScene({ slug: 'abc', seq: 3, fetchImpl: reply(scene) })).toEqual({ ok: false })
    expect(await getPublicScene({ slug: 'abc', seq: 4, fetchImpl: reply({}, 404) })).toEqual({ ok: false })
    const offline = (async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    expect(await getPublicScene({ slug: 'abc', seq: 4, fetchImpl: offline })).toEqual({ ok: false })
  })
})
