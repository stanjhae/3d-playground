import { cn } from '../../lib/cn'
import {
  useEditorStore,
  type CameraPreset,
} from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeTextClass } from '../../lib/studio-chrome'
import { RadioGroup } from '../ui/RadioGroup'

/** Sleeve presets name the render side: `left` is the wearer's right (see `garments.ts`). */
export const CAMERA_BAR_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'front', label: HOUSE_COPY.angleFront },
  { id: 'threeQuarter', label: HOUSE_COPY.angleThreeQuarter },
  { id: 'back', label: HOUSE_COPY.angleBack },
  { id: 'left', label: HOUSE_COPY.wearerRight },
  { id: 'right', label: HOUSE_COPY.wearerLeft },
  { id: 'orbit', label: HOUSE_COPY.angleOrbit },
]

export function CameraPresetBar() {
  const cameraPreset = useEditorStore((state) => state.cameraPreset)
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset)

  return (
    <RadioGroup
      as="nav"
      aria-label="Camera"
      className="flex flex-wrap justify-center gap-x-3 rounded-xl border border-flv-line bg-flv-paper/92 px-3 py-2"
    >
      {CAMERA_BAR_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-checked={cameraPreset === preset.id}
          onClick={() => {
            setCameraPreset({ cameraPreset: preset.id })
          }}
          className={cn('min-h-11', chromeTextClass(), {
            'text-flv-accent': cameraPreset === preset.id,
            'text-flv-muted hover:text-flv-accent': cameraPreset !== preset.id,
          })}
        >
          {preset.label}
        </button>
      ))}
    </RadioGroup>
  )
}
