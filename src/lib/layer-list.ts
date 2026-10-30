import type { DesignLayer, PanelId } from './design-document'
import { layerVoice } from './layer-hit'

/**
 * The "On the cloth" layer list (FLP #157). Layers are grouped by panel and
 * listed top first, the way they stack on the cloth; a layer moves only
 * within its own panel.
 */

export type LayerPlacement = { panel: PanelId; index: number; count: number }

export type LayerRow = {
  layer: DesignLayer
  name: string
  /** Index in the panel's stack, 0 the bottom; null when it cannot move. */
  index: number | null
  canMoveUp: boolean
  canMoveDown: boolean
}

export type LayerGroup = {
  panel: PanelId | null
  label: string
  rows: LayerRow[]
}

function fallbackPanel({ layer }: { layer: DesignLayer }): PanelId | null {
  if (layer.kind === 'paint') {
    return layer.strokes[0]?.panel ?? null
  }

  return 'panel' in layer ? layer.panel : null
}

export function layerListGroups({
  layers,
  panels,
  placement,
}: {
  layers: DesignLayer[]
  panels: readonly { id: PanelId; label: string }[]
  placement: ({ layerId }: { layerId: string }) => LayerPlacement | null
}): LayerGroup[] {
  const groups = new Map<PanelId | null, LayerRow[]>()

  for (const layer of layers) {
    if (layer.kind === 'art') {
      continue
    }

    const placed = placement({ layerId: layer.id })
    const panel = placed?.panel ?? fallbackPanel({ layer })
    const rows = groups.get(panel) ?? []
    rows.push({
      layer,
      name: layerVoice({ layer }),
      index: placed?.index ?? null,
      canMoveUp: placed !== null && placed.index < placed.count - 1,
      canMoveDown: placed !== null && placed.index > 0,
    })
    groups.set(panel, rows)
  }

  const order = [...panels.map((panel) => panel.id), null]
  return order
    .filter((panel) => groups.has(panel))
    .map((panel) => {
      const rows = groups.get(panel)!
      // Top of the stack first; rows that cannot move keep document order.
      const sorted = rows.every((row) => row.index !== null)
        ? [...rows].sort((a, b) => b.index! - a.index!)
        : [...rows].reverse()

      return {
        panel,
        label: panels.find((entry) => entry.id === panel)?.label ?? 'Other',
        rows: sorted,
      }
    })
}

export function layerMovedMessage({
  name,
  direction,
  placement,
  panelLabel,
}: {
  name: string
  direction: 'up' | 'down'
  placement: LayerPlacement | null
  panelLabel: string
}) {
  if (!placement) {
    return `${name} moved ${direction}.`
  }

  // Position counted from the top, as the list reads.
  const position = placement.count - placement.index
  return `${name} moved ${direction}, ${position} of ${placement.count} on the ${panelLabel.toLowerCase()}.`
}

export function layerEdgeMessage({
  name,
  direction,
}: {
  name: string
  direction: 'up' | 'down'
}) {
  return direction === 'up' ? `${name} is already on top.` : `${name} is already at the bottom.`
}

export function layerDeletedMessage({ name }: { name: string }) {
  return `${name} deleted. Undo to bring it back.`
}

export function layerVisibilityMessage({
  name,
  visible,
}: {
  name: string
  visible: boolean
}) {
  return visible ? `${name} shown.` : `${name} hidden.`
}

/**
 * After a row is deleted, focus the row that took its place, else the one
 * above it; null when the list is now empty.
 */
export function focusAfterDelete({
  orderedIds,
  deletedId,
}: {
  orderedIds: string[]
  deletedId: string
}) {
  const at = orderedIds.indexOf(deletedId)
  const rest = orderedIds.filter((id) => id !== deletedId)

  if (rest.length === 0) {
    return null
  }

  if (at < 0) {
    return rest[0]!
  }

  return rest[Math.min(at, rest.length - 1)]!
}
