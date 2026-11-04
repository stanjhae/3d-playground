import { create } from 'zustand'

import type { DesignDocument } from './design-document.ts'
import { listLayerSrcs } from './layer-images.ts'
import { textFaceState } from './text-faces.ts'

/**
 * Whether the atlas on the 3D garment is the whole of the current document
 * (R01 #164). Words wait for their font and images for their bytes, so an atlas
 * can be up to date and still be missing artwork; the preview says so, and
 * publishing waits rather than photograph it.
 *
 * Builds run synchronously from the document, and image decodes drop a batch
 * that a newer one replaced (`loadLayerImages`), so an older build can't land
 * after a newer one. The tag is what lets a reader check this one is current.
 */

/** Bump when the same document would draw differently. */
export const ATLAS_COMPILER_VERSION = 1

/**
 * `fallback`: everything is drawn, but a font missed its load, so some words
 * are in a stand-in. `error`: an image is missing from the drawing.
 */
export type ArtworkState = 'loading' | 'ready' | 'fallback' | 'error'

export function artworkState({
  document,
  images,
  imagesSettled,
  faceState = textFaceState,
}: {
  document: DesignDocument
  images: Record<string, unknown>
  /** The batch for this document's images has finished, loaded or not. */
  imagesSettled: boolean
  faceState?: typeof textFaceState
}): ArtworkState {
  let loading = !imagesSettled
  let failed = imagesSettled && listLayerSrcs({ document }).some((src) => !images[src])
  let standIn = false

  for (const layer of document.layers) {
    if (!layer.visible) {
      continue
    }

    if (layer.kind === 'graphic' && layer.missing) {
      failed = true
    }

    if (layer.kind === 'text' && layer.content.trim()) {
      const state = faceState({ face: layer.face, text: layer.content.slice(0, 32) })
      loading ||= state === 'loading'
      standIn ||= state === 'failed'
    }
  }

  return loading ? 'loading' : failed ? 'error' : standIn ? 'fallback' : 'ready'
}

export type AtlasBuild = {
  /** The document this atlas was drawn from. */
  document: DesignDocument
  revision: number
  templateVersion: number
  compilerVersion: number
  state: ArtworkState
}

export const useAtlasBuild = create<{ build: AtlasBuild | null }>(() => ({ build: null }))

/** What the current atlas means for this document at this revision. */
export function atlasBuildState({
  build,
  document,
  revision,
}: {
  build: AtlasBuild | null
  document: DesignDocument
  revision: number
}): ArtworkState {
  return !build ||
    build.document !== document ||
    build.revision !== revision ||
    build.compilerVersion !== ATLAS_COMPILER_VERSION
    ? 'loading'
    : build.state
}

/** Resolves when the atlas is settled for the document `current` returns, or on `timeoutMs`. */
export function waitForCurrentAtlas({
  current,
  timeoutMs = 15_000,
}: {
  current: () => { document: DesignDocument; revision: number }
  timeoutMs?: number
}): Promise<ArtworkState> {
  const state = () => atlasBuildState({ build: useAtlasBuild.getState().build, ...current() })

  return new Promise((resolve) => {
    if (state() !== 'loading') {
      resolve(state())
      return
    }

    const finish = () => {
      clearTimeout(timer)
      stop()
      resolve(state())
    }
    const timer = setTimeout(finish, timeoutMs)
    const stop = useAtlasBuild.subscribe(() => {
      if (state() !== 'loading') {
        finish()
      }
    })
  })
}
