import type { DesignDocument, PanelId } from './design-document'
import { isLiveStudioCanvas } from './capture-still'
import { clothColorOf } from './cloth-color'
import { garmentPanels } from './garments'
import { decodeDocumentImages } from './layer-images'
import { rasterizeLayers } from './paint-atlas'
import { atlasSourceRect } from './panel-uv'
import { STILL_FRAME } from './studio-camera'

/**
 * "Download image" (UX review, 26 Nov: no image export): a PNG of the 3D
 * view as it is on screen, or a sheet with the 3D view beside every flat
 * side. The layout and the file name are plain maths, unit tested; drawing
 * needs a browser.
 */

/** Older templates draw every panel at 6:7 (as `PaintCanvas` does). */
const DEFAULT_PANEL_ASPECT = 6 / 7

/** The flat sides are drawn from an atlas this size: sharper than the studio's 512. */
export const SHEET_ATLAS_SIZE = 1024

export const SHEET = {
  margin: 48,
  gap: 32,
  /** Room for each side's name above it. */
  label: 40,
  /** The design's name across the top. */
  header: 72,
  /** Each side's box, before its own shape is fitted inside. */
  cellHeight: 480,
  columns: 2,
  background: '#f6f3ee',
  ink: '#1a1c22',
  muted: '#5b6270',
  line: '#d9d4cc',
} as const

export type SheetPanel = { id: PanelId; label: string; aspect: number }
export type SheetBox = { x: number; y: number; width: number; height: number }

export type SheetLayout = {
  width: number
  height: number
  /** Where the 3D view goes, or null for a sheet of flat sides alone. */
  view: SheetBox | null
  panels: (SheetBox & { id: PanelId; label: string; labelX: number; labelY: number })[]
  title: { x: number; y: number }
}

/** A box of `aspect` (width / height), as large as fits in `cell`, centred. */
export function fitInside({ cell, aspect }: { cell: SheetBox; aspect: number }): SheetBox {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const width = Math.min(cell.width, cell.height * safe)
  const height = width / safe

  return {
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
  }
}

/**
 * The sheet: the 3D view on the left at the grid's height, the flat sides
 * two to a row on the right, each under its name. Whole pixels throughout.
 */
export function designSheetLayout({
  panels,
  view,
}: {
  panels: SheetPanel[]
  /** The 3D view's pixel size, or null to leave it off. */
  view: { width: number; height: number } | null
}): SheetLayout {
  const { margin, gap, label, header, cellHeight, columns } = SHEET
  const widest = Math.max(DEFAULT_PANEL_ASPECT, ...panels.map((panel) => panel.aspect).filter((aspect) => aspect > 0))
  const cellWidth = Math.round(cellHeight * widest)
  const rows = Math.max(1, Math.ceil(panels.length / columns))
  const used = Math.min(columns, Math.max(1, panels.length))
  const gridWidth = used * cellWidth + (used - 1) * gap
  const gridHeight = rows * (label + cellHeight) + (rows - 1) * gap
  const top = margin + header
  const viewBox =
    view && view.width > 0 && view.height > 0
      ? { x: margin, y: top, width: Math.round((gridHeight * view.width) / view.height), height: gridHeight }
      : null
  const gridLeft = margin + (viewBox ? viewBox.width + gap : 0)

  return {
    width: gridLeft + gridWidth + margin,
    height: top + gridHeight + margin,
    view: viewBox,
    title: { x: margin, y: margin },
    panels: panels.map((panel, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const cellX = gridLeft + column * (cellWidth + gap)
      const cellY = top + row * (label + cellHeight + gap)
      const box = fitInside({ cell: { x: cellX, y: cellY + label, width: cellWidth, height: cellHeight }, aspect: panel.aspect })

      return {
        id: panel.id,
        label: panel.label,
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        labelX: cellX,
        labelY: cellY,
      }
    }),
  }
}

/** The flat sides of a garment, in the studio's order, with their shapes. */
export function sheetPanels({ document, garmentId }: { document: DesignDocument; garmentId: string | null }): SheetPanel[] {
  return garmentPanels({ garmentId }).map((panel) => ({
    id: panel.id,
    label: panel.label,
    aspect: document.panelAspects?.[panel.id] ?? DEFAULT_PANEL_ASPECT,
  }))
}

/** `fashion-leader-summer-tee-3d-2026-11-27.png`: safe on every system. */
export function exportFileName({ title, kind, date }: { title: string; kind: '3d' | 'sheet'; date: Date }) {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-')

  return `fashion-leader-${slug || 'design'}-${kind}-${day}.png`
}

function canvasOf({ width, height }: { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/**
 * The 3D view as it is on screen, on the stills' backdrop where the scene
 * is see-through. Null when there is no live 3D view to read.
 */
export function studioViewCanvas({ canvas }: { canvas: HTMLCanvasElement | null }) {
  if (!canvas || !isLiveStudioCanvas({ canvas })) {
    return null
  }

  const out = canvasOf({ width: canvas.width, height: canvas.height })
  const context = out.getContext('2d')

  if (!context) {
    return null
  }

  context.fillStyle = STILL_FRAME.fill
  context.fillRect(0, 0, out.width, out.height)

  try {
    context.drawImage(canvas, 0, 0)
  } catch {
    return null
  }

  return out
}

/** The 3D view beside every flat side, on one canvas. */
export async function designSheetCanvas({
  document: designDocument,
  garmentId,
  title,
  view,
  overlays,
}: {
  document: DesignDocument
  garmentId: string | null
  title: string
  /** The 3D view (`studioViewCanvas`); null leaves it off. */
  view: HTMLCanvasElement | null
  /**
   * What goes over each side at a given size, in order (the off-garment
   * shading, then the outline), where the garment's shapes are known.
   */
  overlays?: (input: { panel: PanelId; width: number; height: number }) => (HTMLCanvasElement | null)[]
}) {
  const panels = sheetPanels({ document: designDocument, garmentId })
  const layout = designSheetLayout({ panels, view: view ? { width: view.width, height: view.height } : null })
  const images = await decodeDocumentImages({ document: designDocument })
  const atlas = rasterizeLayers({
    document: designDocument,
    width: SHEET_ATLAS_SIZE,
    height: SHEET_ATLAS_SIZE,
    images,
  })
  const atlasCanvas = canvasOf({ width: atlas.width, height: atlas.height })
  atlasCanvas
    .getContext('2d')
    ?.putImageData(new ImageData(new Uint8ClampedArray(atlas.pixels), atlas.width, atlas.height), 0, 0)
  const sheet = canvasOf(layout)
  const context = sheet.getContext('2d')

  if (!context) {
    return null
  }

  context.fillStyle = SHEET.background
  context.fillRect(0, 0, sheet.width, sheet.height)
  context.fillStyle = SHEET.ink
  context.textBaseline = 'top'
  context.font = '600 32px system-ui, sans-serif'
  context.fillText(title || 'Untitled design', layout.title.x, layout.title.y)

  if (view && layout.view) {
    context.drawImage(view, layout.view.x, layout.view.y, layout.view.width, layout.view.height)
  }

  const ground = clothColorOf({ document: designDocument })

  for (const panel of layout.panels) {
    context.fillStyle = SHEET.muted
    context.font = '500 20px system-ui, sans-serif'
    context.fillText(panel.label, panel.labelX, panel.labelY + 8)
    context.fillStyle = ground
    context.fillRect(panel.x, panel.y, panel.width, panel.height)
    const source = atlasSourceRect({
      panel: panel.id,
      width: atlas.width,
      height: atlas.height,
      rects: designDocument.panelUv,
    })
    context.drawImage(
      atlasCanvas,
      source.sourceX,
      source.sourceY,
      source.sourceWidth,
      source.sourceHeight,
      panel.x,
      panel.y,
      panel.width,
      panel.height,
    )
    const over = (overlays?.({ panel: panel.id, width: panel.width, height: panel.height }) ?? []).filter(
      (layer): layer is HTMLCanvasElement => layer !== null,
    )

    for (const layer of over) {
      context.drawImage(layer, panel.x, panel.y, panel.width, panel.height)
    }

    if (over.length === 0) {
      context.strokeStyle = SHEET.line
      context.lineWidth = 2
      context.strokeRect(panel.x + 1, panel.y + 1, panel.width - 2, panel.height - 2)
    }
  }

  return sheet
}

/** Saves a canvas as a PNG file through the browser's download. */
export async function downloadCanvas({ canvas, fileName }: { canvas: HTMLCanvasElement; fileName: string }) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (!blob) {
    return false
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // After the browser has taken the file.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return true
}
