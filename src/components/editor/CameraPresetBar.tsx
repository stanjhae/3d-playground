import { cn } from '../../lib/cn'
import {
  useEditorStore,
  type CameraPreset,
} from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'front', label: HOUSE_COPY.angleFront },
  { id: 'threeQuarter', label: HOUSE_COPY.angleThreeQuarter },
  { id: 'back', label: HOUSE_COPY.angleBack },
  { id: 'orbit', label: HOUSE_COPY.angleOrbit },
]

export function CameraPresetBar() {
  const cameraPreset = useEditorStore((state) => state.cameraPreset)
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset)

  return (
    <nav
      aria-label="Camera"
      className="flex gap-3 border border-atelier-line bg-atelier/92 px-3 py-2"
    >
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={cameraPreset === preset.id}
          onClick={() => {
            setCameraPreset({ cameraPreset: preset.id })
          }}
          className={cn('min-h-11', chromeTextClass(), {
            'text-brass': cameraPreset === preset.id,
            'text-ivory-muted hover:text-brass': cameraPreset !== preset.id,
          })}
        >
          {preset.label}
        </button>
      ))}
    </nav>
  )
}
