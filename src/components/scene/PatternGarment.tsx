import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { DrapeCancelled } from '../../lib/cloth/cloth-client'
import { sharedDrapeClient } from '../../lib/cloth/shared-drape'
import type { DrapedMesh } from '../../lib/cloth/drape-job'
import type { DesignDocument } from '../../lib/design-document'
import type { MaterialOverride } from '../../lib/design-schema'
import type { CanonicalPattern } from '../../lib/pattern/pattern-document'
import { shapesFromScene, usePanelShapes } from '../../lib/panel-shape'
import { buildPatternScene } from '../../lib/pattern/pattern-scene'
import { usePatternDrape } from '../../lib/pattern-drape-status'
import { SOLVER_VERSION } from '../../lib/cloth/solver'
import { useEditorStore } from '../../lib/editor-store'
import { fetchStoredMesh, storeMesh } from '../../lib/pattern/mesh-sync'
import { resolveTemplate } from '../../lib/template-manifest'
import { SeatedForm } from './Garment'


/** A drape left alone this long is stored, so the next visit loads it instead of draping. */
const STORE_AFTER_MS = 30_000

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

  // A saved design's stored drape comes first; the studio drapes only what
  // it hasn't seen, and stores a drape that's been left alone a while.
  const cloudDesign = useEditorStore((state) => (picking ? state.cloud?.designId ?? null : null))

  useEffect(() => {
    let live = true
    let storeTimer: ReturnType<typeof setTimeout> | null = null
    const pattern = JSON.parse(patternKey) as CanonicalPattern
    const drapes = sharedDrapeClient()

    const show = (draped: DrapedMesh) => {
      setMesh(draped)
      usePatternDrape.setState({ state: 'ready', progress: 1 })
    }

    void (async () => {
      const hit = await drapes.cached({ pattern })

      if (!live) {
        return
      }

      if (hit) {
        show(hit)
        return
      }

      if (cloudDesign) {
        usePatternDrape.setState({ state: 'draping', progress: 0 })
        const stored = await fetchStoredMesh({ pattern, solverVersion: SOLVER_VERSION })

        if (!live) {
          return
        }

        if (stored) {
          await drapes.remember({ pattern, mesh: stored })
          show(stored)
          return
        }
      }

      usePatternDrape.setState((state) => ({ state: 'draping', progress: 0, runs: state.runs + 1 }))

      try {
        const draped = await drapes.drape({ pattern, onProgress: (progress) => live && usePatternDrape.setState({ progress }) })

        if (!live) {
          return
        }

        show(draped)

        if (cloudDesign) {
          storeTimer = setTimeout(() => void storeMesh({ pattern, mesh: draped }), STORE_AFTER_MS)
        }
      } catch (error) {
        if (live && !(error instanceof DrapeCancelled)) {
          usePatternDrape.setState({ state: 'failed', progress: 0 })
        }
      }
    })()

    return () => {
      live = false

      if (storeTimer) {
        clearTimeout(storeTimer)
      }
    }
  }, [cloudDesign, patternKey])

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
