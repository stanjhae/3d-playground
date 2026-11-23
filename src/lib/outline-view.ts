import type { DesignDocument } from './design-document'
import { isBaseFill } from './layer-hit'

/** Bare paper behind the outline view, so the line and the marks stand out. */
export const OUTLINE_GROUND = '#f7f6f2'

/** The garment's outline line on the 2D sides. */
export const OUTLINE_COLOR = '#1a1c22'

/** The outline of the side being edited (`--color-flv-accent`). */
export const ACTIVE_OUTLINE_COLOR = '#e0141f'

/**
 * The document as the Hide print view draws it: the garment's base colour
 * and pattern are left out, the marks drawn on it stay. Nothing is saved
 * from this; it is the 2D sides' view only.
 */
export function outlineViewDocument({ document }: { document: DesignDocument }): DesignDocument {
  if (!document.layers.some((layer) => isBaseFill({ layer }) && layer.visible)) {
    return document
  }

  return {
    ...document,
    layers: document.layers.map((layer) => (isBaseFill({ layer }) && layer.visible ? { ...layer, visible: false } : layer)),
  }
}
