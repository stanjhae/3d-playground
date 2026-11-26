import { describe, expect, test } from 'vitest'

import { createEmptyDocument } from './design-document'
import { SHEET, designSheetLayout, exportFileName, fitInside, sheetPanels } from './design-export'

const TEE = [
  { id: 'front' as const, label: 'Front', aspect: 6 / 7 },
  { id: 'back' as const, label: 'Back', aspect: 6 / 7 },
  { id: 'left' as const, label: 'Left sleeve', aspect: 6 / 7 },
  { id: 'right' as const, label: 'Right sleeve', aspect: 6 / 7 },
]

const inside = (box: { x: number; y: number; width: number; height: number }, sheet: { width: number; height: number }) =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= sheet.width && box.y + box.height <= sheet.height

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('fitInside', () => {
  test('a tall shape in a wide cell is centred across, and keeps its shape', () => {
    const box = fitInside({ cell: { x: 10, y: 20, width: 400, height: 200 }, aspect: 0.5 })
    expect(box).toEqual({ x: 160, y: 20, width: 100, height: 200 })
    expect(fitInside({ cell: { x: 0, y: 0, width: 100, height: 100 }, aspect: 0 })).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })
})

describe('designSheetLayout', () => {
  test('the 3D view on the left at the grid’s height, the four sides two to a row', () => {
    const layout = designSheetLayout({ panels: TEE, view: { width: 1600, height: 1000 } })

    expect(layout.view).not.toBeNull()
    expect(layout.view!.x).toBe(SHEET.margin)
    expect(layout.view!.width / layout.view!.height).toBeCloseTo(1.6, 2)
    // Two rows: the grid's height is two labels, two cells and a gap.
    expect(layout.view!.height).toBe(2 * (SHEET.label + SHEET.cellHeight) + SHEET.gap)

    const [front, back, left, right] = layout.panels
    expect(front!.y).toBe(back!.y)
    expect(left!.y).toBe(right!.y)
    expect(left!.y).toBeGreaterThan(front!.y + front!.height)
    expect(front!.x).toBeGreaterThan(layout.view!.x + layout.view!.width)

    for (const panel of layout.panels) {
      expect(inside(panel, layout)).toBe(true)
      expect(overlaps(panel, layout.view!)).toBe(false)
      expect(panel.width / panel.height).toBeCloseTo(6 / 7, 2)
    }

    for (const [index, a] of layout.panels.entries()) {
      for (const b of layout.panels.slice(index + 1)) {
        expect(overlaps(a, b)).toBe(false)
      }
    }
  })

  test('without a 3D view the sides start at the margin', () => {
    const layout = designSheetLayout({ panels: TEE, view: null })

    expect(layout.view).toBeNull()
    expect(layout.panels[0]!.labelX).toBe(SHEET.margin)
    expect(layout.width).toBe(SHEET.margin * 2 + 2 * Math.round(SHEET.cellHeight * (6 / 7)) + SHEET.gap)
  })

  test('a template’s own shapes each keep their aspect; an odd count leaves the last row half full', () => {
    const panels = [
      { id: 'front' as const, label: 'Bodice', aspect: 0.5 },
      { id: 'back' as const, label: 'Skirt', aspect: 1.6 },
      { id: 'left' as const, label: 'Hood', aspect: 1 },
    ]
    const layout = designSheetLayout({ panels, view: { width: 800, height: 800 } })

    expect(layout.panels.map((panel) => Math.round((panel.width / panel.height) * 10) / 10)).toEqual([0.5, 1.6, 1])
    expect(layout.panels[2]!.labelY).toBeGreaterThan(layout.panels[0]!.labelY)

    for (const panel of layout.panels) {
      expect(inside(panel, layout)).toBe(true)
      expect(Number.isInteger(panel.x) && Number.isInteger(panel.width)).toBe(true)
    }
  })
})

describe('sheetPanels', () => {
  test('the tee’s four sides at their drawn shape', () => {
    const panels = sheetPanels({ document: createEmptyDocument({ garmentId: 'tee' }), garmentId: 'tee' })

    expect(panels.map((panel) => panel.id)).toEqual(['front', 'back', 'left', 'right'])
    expect(panels.every((panel) => panel.aspect > 0)).toBe(true)
  })
})

describe('exportFileName', () => {
  const date = new Date(2026, 10, 7)

  test('a safe, dated name from the design’s title', () => {
    expect(exportFileName({ title: 'Summer Tee', kind: '3d', date })).toBe('fashion-leader-summer-tee-3d-2026-11-07.png')
    expect(exportFileName({ title: '  Café  “Noir”!! ', kind: 'sheet', date })).toBe('fashion-leader-cafe-noir-sheet-2026-11-07.png')
    expect(exportFileName({ title: '../../etc', kind: '3d', date })).toBe('fashion-leader-etc-3d-2026-11-07.png')
    expect(exportFileName({ title: '', kind: '3d', date })).toBe('fashion-leader-design-3d-2026-11-07.png')
    expect(exportFileName({ title: '雪', kind: '3d', date })).toBe('fashion-leader-design-3d-2026-11-07.png')
    expect(exportFileName({ title: 'a'.repeat(80), kind: '3d', date }).length).toBeLessThan(90)
  })
})
