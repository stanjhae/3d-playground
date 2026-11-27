import type { PanelId } from './design-document'
import type { AngleCameraPreset, CameraPreset } from './editor-store'

/** Which panel canvases to mount for the current layout and viewport. */
export function paintSurfacePanels({
  layout,
  paintPanel,
  panels,
  lgUp,
}: {
  layout: 'single' | 'quad'
  paintPanel: PanelId
  panels: readonly { id: PanelId }[]
  lgUp: boolean
}): PanelId[] {
  if (layout !== 'quad' || !lgUp) {
    return [paintPanel]
  }

  return panels.map((panel) => panel.id)
}

/** Map free-orbit camera to the 3/4 strip slot for live still previews. */
export function angleStripPreset({
  cameraPreset,
}: {
  cameraPreset: CameraPreset
}): AngleCameraPreset {
  if (cameraPreset === 'orbit') {
    return 'threeQuarter'
  }

  return cameraPreset
}
