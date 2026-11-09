import type { DesignDocument, PanelId } from './design-document.ts'
import { HOUSE_COPY } from './house-copy.ts'

/**
 * The 3D view in words, for people who can't see the canvas. Sleeves use
 * the wearer's side, as the studio's labels do: panel `left` is the
 * wearer's right (see `garments.ts`).
 */

const SIDES: { panel: PanelId; label: string }[] = [
  { panel: 'front', label: HOUSE_COPY.front },
  { panel: 'back', label: HOUSE_COPY.back },
  { panel: 'left', label: HOUSE_COPY.wearerRight },
  { panel: 'right', label: HOUSE_COPY.wearerLeft },
]

const MAX_QUOTE = 40

function counted({ count, one, many }: { count: number; one: string; many: string }) {
  return count === 0 ? [] : [`${count} ${count === 1 ? one : many}`]
}

function quoted({ content }: { content: string }) {
  const text = content.trim()
  return `“${text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE)}…` : text}”`
}

export function describeDesign({ document }: { document: DesignDocument }) {
  const visible = document.layers.filter((layer) => layer.visible)
  const sides = SIDES.flatMap(({ panel, label }) => {
    const words = visible.flatMap((layer) => (layer.kind === 'text' && layer.panel === panel ? [quoted({ content: layer.content })] : []))
    const images = visible.filter((layer) => layer.kind === 'graphic' && layer.panel === panel).length
    const drawings = visible.filter(
      (layer) => layer.kind === 'paint' && layer.strokes.some((stroke) => stroke.panel === panel && stroke.tool !== 'eraser'),
    ).length
    const parts = [
      ...words,
      ...counted({ count: images, one: 'image', many: 'images' }),
      ...counted({ count: drawings, one: 'drawing', many: 'drawings' }),
    ]
    return parts.length > 0 ? [`${label}: ${parts.join(', ')}.`] : []
  })
  const cloth = visible.some((layer) => layer.kind === 'pattern') ? ' Patterned cloth.' : ''

  return `3D preview of your design.${cloth} ${sides.length > 0 ? sides.join(' ') : 'No artwork on it yet.'}`
}
