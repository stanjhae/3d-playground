import type { CanonicalTextFace } from './canonical-document'

/**
 * The text faces the studio ships (tester, 22 Nov: "different fonts to
 * choose from"). One row per canonical face: how it is drawn on canvas and
 * named in the picker, and where it comes from. Every font is bundled
 * (`@fontsource`, under `font-src 'self'`) and freely licensed.
 * `scripts/glyph-coverage.mjs` reads the same stylesheets.
 */
export type TextFaceInfo = {
  face: CanonicalTextFace
  /** What the picker calls it. */
  label: string
  family: string
  /** The weight drawn, as bundled. */
  weight: number
  /** Drawn while the face loads, or if it never does. */
  fallback: string
  package: string
  license: 'OFL-1.1' | 'Apache-2.0'
}

export const TEXT_FACE_CATALOGUE: Record<CanonicalTextFace, TextFaceInfo> = {
  display: {
    face: 'display',
    label: 'Serif',
    family: 'Cormorant Garamond',
    weight: 600,
    fallback: 'Palatino, "Iowan Old Style", Georgia, serif',
    package: '@fontsource/cormorant-garamond',
    license: 'OFL-1.1',
  },
  sans: {
    face: 'sans',
    label: 'Sans',
    family: 'Outfit',
    // As drawn since #155; the browser picks the nearest bundled weight.
    weight: 600,
    fallback: '"Avenir Next", "Segoe UI", system-ui, sans-serif',
    package: '@fontsource/outfit',
    license: 'OFL-1.1',
  },
  slab: {
    face: 'slab',
    label: 'Slab',
    family: 'Roboto Slab',
    weight: 700,
    fallback: 'Rockwell, "Courier New", serif',
    package: '@fontsource/roboto-slab',
    license: 'Apache-2.0',
  },
  condensed: {
    face: 'condensed',
    label: 'Condensed',
    family: 'Oswald',
    weight: 600,
    fallback: '"Arial Narrow", Impact, sans-serif',
    package: '@fontsource/oswald',
    license: 'OFL-1.1',
  },
  script: {
    face: 'script',
    label: 'Script',
    family: 'Pacifico',
    weight: 400,
    fallback: '"Brush Script MT", cursive',
    package: '@fontsource/pacifico',
    license: 'OFL-1.1',
  },
  marker: {
    face: 'marker',
    label: 'Marker',
    family: 'Sedgwick Ave',
    weight: 400,
    fallback: '"Marker Felt", "Comic Sans MS", cursive',
    package: '@fontsource/sedgwick-ave',
    license: 'OFL-1.1',
  },
  mono: {
    face: 'mono',
    label: 'Mono',
    family: 'Space Mono',
    weight: 700,
    fallback: 'Menlo, Consolas, monospace',
    package: '@fontsource/space-mono',
    license: 'OFL-1.1',
  },
  blackletter: {
    face: 'blackletter',
    label: 'Gothic',
    family: 'UnifrakturMaguntia',
    weight: 400,
    fallback: '"Old English Text MT", serif',
    package: '@fontsource/unifrakturmaguntia',
    license: 'OFL-1.1',
  },
}

/** The canvas/CSS font for a face at a size. */
export function faceCss({ face, size }: { face: CanonicalTextFace; size: number }) {
  const info = TEXT_FACE_CATALOGUE[face]
  return `${info.weight} ${size}px "${info.family}"`
}
