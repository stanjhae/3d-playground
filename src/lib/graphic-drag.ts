import { isSafeLayerSrc } from './look-thumbnail'

/** The drag payload a graphic tile carries onto a panel or the cloth. */
export const GRAPHIC_DRAG_TYPE = 'application/x-flv-graphic'

export function startGraphicDrag({
  dataTransfer,
  src,
}: {
  dataTransfer: DataTransfer
  src: string
}) {
  dataTransfer.setData(GRAPHIC_DRAG_TYPE, src)
  dataTransfer.effectAllowed = 'copy'
}

export function carriesGraphic({ dataTransfer }: { dataTransfer: DataTransfer | null }) {
  return Boolean(dataTransfer?.types.includes(GRAPHIC_DRAG_TYPE))
}

/** The dropped graphic's src, or null for anything else or anything unsafe. */
export function droppedGraphic({ dataTransfer }: { dataTransfer: DataTransfer | null }) {
  const src = dataTransfer?.getData(GRAPHIC_DRAG_TYPE) ?? ''
  return src && isSafeLayerSrc({ src }) ? src : null
}
