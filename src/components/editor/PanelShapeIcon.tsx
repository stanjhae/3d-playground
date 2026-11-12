import { useMemo } from 'react'

import type { PanelId } from '../../lib/design-document'
import { useEditorStore } from '../../lib/editor-store'
import { usePanelShapes } from '../../lib/panel-shape'

const WIDTH = 16
const HEIGHT = 20

/**
 * A side's own shape in miniature beside its tab, so Front, Back and the
 * sleeves read as the pieces they are. Nothing for the drawn tee, whose
 * sides are plain rectangles. An SVG, not a canvas: the studio's canvases
 * are its drawing surfaces.
 */
export function PanelShapeIcon({ panel }: { panel: PanelId }) {
  const modelSrc = useEditorStore((state) => state.document.modelSrc)
  const triangles = usePanelShapes((state) => (state.src === modelSrc ? state.shapes[panel] : undefined))
  const path = useMemo(() => {
    if (!triangles) {
      return null
    }

    const point = (x: number, y: number) => `${(x * WIDTH).toFixed(1)} ${((1 - y) * HEIGHT).toFixed(1)}`
    let d = ''

    for (let i = 0; i + 5 < triangles.length; i += 6) {
      d += `M${point(triangles[i]!, triangles[i + 1]!)}L${point(triangles[i + 2]!, triangles[i + 3]!)}L${point(triangles[i + 4]!, triangles[i + 5]!)}Z`
    }

    return d
  }, [triangles])

  if (!path) {
    return null
  }

  return (
    <svg aria-hidden viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} className="shrink-0 fill-current">
      <path d={path} />
    </svg>
  )
}
