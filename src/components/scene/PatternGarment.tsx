import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { DrapeCancelled, type DrapeClient, createDrapeClient } from '../../lib/cloth/cloth-client'
import type { DrapedMesh } from '../../lib/cloth/drape-job'
import type { DesignDocument } from '../../lib/design-document'
import type { MaterialOverride } from '../../lib/design-schema'
import type { CanonicalPattern } from '../../lib/pattern/pattern-document'
import { shapesFromScene, usePanelShapes } from '../../lib/panel-shape'
import { buildPatternScene } from '../../lib/pattern/pattern-scene'
import { usePatternDrape } from '../../lib/pattern-drape-status'
import { resolveTemplate } from '../../lib/template-manifest'
import { SeatedForm } from './Garment'

let client: DrapeClient | null = null

/** One cloth worker for the whole studio, so a new drape cancels a stale one. */
export function sharedDrapeClient() {
  client ??= createDrapeClient()
  return client
}

/**
 * A garment in Pattern mode: its pieces draped in the cloth worker, then
 * dressed like any model (base colour, fabric, prints through `uv1`). Until
 * the first drape lands, `fallback` (the template's own model) stands in;
 * after that the last drape stays up while a new one runs.
 */
export default function PatternGarment({
  inkDocument,
  overrides,
  picking,
  fallback,
}: {
  inkDocument: DesignDocument & { pattern: NonNullable<DesignDocument['pattern']> }
  overrides: MaterialOverride[]
  picking: boolean
  fallback: ReactNode
}) {
  const render = inkDocument.pattern
  // The render document is rebuilt on every edit; only a pattern change re-drapes.
  const patternKey = useMemo(() => JSON.stringify(render.pattern), [render.pattern])
  const [mesh, setMesh] = useState<DrapedMesh | null>(null)

  useEffect(() => {
    let live = true
    const pattern = JSON.parse(patternKey) as CanonicalPattern
    const drapes = sharedDrapeClient()

    void drapes.cached({ pattern }).then((hit) => {
      if (!live) {
        return
      }

      if (hit) {
        setMesh(hit)
        usePatternDrape.setState({ state: 'ready', progress: 1 })
        return
      }

      usePatternDrape.setState((state) => ({ state: 'draping', progress: 0, runs: state.runs + 1 }))
      drapes
        .drape({ pattern, onProgress: (progress) => live && usePatternDrape.setState({ progress }) })
        .then((draped) => {
          if (live) {
            setMesh(draped)
            usePatternDrape.setState({ state: 'ready', progress: 1 })
          }
        })
        .catch((error: unknown) => {
          if (live && !(error instanceof DrapeCancelled)) {
            usePatternDrape.setState({ state: 'failed', progress: 0 })
          }
        })
    })

    return () => {
      live = false
    }
  }, [patternKey])

  useEffect(() => () => usePatternDrape.setState({ state: 'idle', progress: 0 }), [])

  const panelUv = inkDocument.panelUv
  const scene = useMemo(() => {
    if (!mesh || !panelUv) {
      return null
    }

    const { pattern } = render
    const resolved = resolveTemplate({ id: pattern.basis.templateId, version: pattern.basis.templateVersion })
    const color = resolved.ok ? resolved.manifest.material.color : '#ffffff'
    return buildPatternScene({ mesh, render, panelUv, color })
  }, [mesh, panelUv, render])

  // The flat sides shade what falls off each piece: the draped pattern's own shapes.
  useEffect(() => {
    if (!picking || !scene || !panelUv) {
      return
    }

    usePanelShapes.getState().setShapes({ src: `pattern:${patternKey.length}:${hashString(patternKey)}`, shapes: shapesFromScene({ scene, panelUv }) })
  }, [panelUv, patternKey, picking, scene])

  if (!scene) {
    return <>{fallback}</>
  }

  return <SeatedForm scene={scene} inkDocument={inkDocument} overrides={overrides} picking={picking} />
}

/** A short, stable tag for a string (FNV-1a), for cache keys. */
function hashString(text: string) {
  let hash = 0x811c9dc5

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36)
}
