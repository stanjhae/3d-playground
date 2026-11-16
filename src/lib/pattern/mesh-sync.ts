import type { DrapedMesh } from '../cloth/drape-job.ts'
import { call } from '../flp-api/client.ts'
import type { PatternMeshResponse } from '../flp-api/pattern-meshes.ts'
import { decodeMesh, encodeMesh } from './mesh-codec.ts'
import type { CanonicalPattern } from './pattern-document.ts'
import { hashPattern } from './pattern-hash.ts'

/**
 * The studio's side of stored meshes: fetch the stored drape for a
 * pattern (a reload never re-simulates), and store a fresh drape once it
 * settles on a saved design. Failures are quiet: the studio drapes again,
 * and publishing waits for a stored mesh (the server checks).
 */
export async function fetchStoredMesh({
  pattern,
  solverVersion,
  fetchImpl = fetch,
}: {
  pattern: CanonicalPattern
  solverVersion: number
  fetchImpl?: typeof fetch
}): Promise<DrapedMesh | null> {
  const patternHash = await hashPattern({ pattern })
  const found = await call<PatternMeshResponse>({ path: `pattern-meshes?hash=${patternHash}&solver=${solverVersion}`, fetchImpl })

  if (!found.ok || found.data.status !== 'ready') {
    return null
  }

  try {
    const response = await fetchImpl(found.data.url)
    return response.ok ? decodeMesh(new Uint8Array(await response.arrayBuffer())) : null
  } catch {
    return null
  }
}

/** Stores a drape for its pattern; true once the server has checked it. */
export async function storeMesh({
  pattern,
  mesh,
  fetchImpl = fetch,
}: {
  pattern: CanonicalPattern
  mesh: DrapedMesh
  fetchImpl?: typeof fetch
}): Promise<boolean> {
  const patternHash = await hashPattern({ pattern })
  const key = { patternHash, solverVersion: mesh.solverVersion }
  const reserved = await call<PatternMeshResponse>({ path: 'pattern-meshes', method: 'POST', body: key, fetchImpl })

  if (!reserved.ok) {
    return false
  }

  if (reserved.data.status === 'ready') {
    return true
  }

  try {
    const uploaded = await fetchImpl(reserved.data.upload.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: encodeMesh({ mesh, patternHash }) as BodyInit,
    })

    if (!uploaded.ok) {
      return false
    }
  } catch {
    return false
  }

  const finalized = await call<PatternMeshResponse>({ path: 'pattern-meshes/finalize', method: 'POST', body: key, fetchImpl })
  return finalized.ok && finalized.data.status === 'ready'
}
