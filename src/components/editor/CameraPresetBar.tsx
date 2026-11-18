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

/** Phone labels: one row fits a 320 px screen. The full name stays the accessible one. */
const COMPACT_LABELS: Partial<Record<CameraPreset, string>> = {
  left: 'R sleeve',
  right: 'L sleeve',
}

export function CameraPresetBar({
  compact = false,
}: {
  /** Phones: one row that never wraps over the garment, with short sleeve labels. */
  compact?: boolean
} = {}) {
  const cameraPreset = useEditorStore((state) => state.cameraPreset)
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset)

  return (
    <RadioGroup
      as="nav"
      aria-label="Camera"
      className={cn('flex justify-center rounded-xl border border-flv-line bg-flv-paper/92 py-2', {
        'flex-wrap gap-x-3 px-3': !compact,
        'max-w-full flex-nowrap gap-x-2.5 overflow-x-auto px-2.5 whitespace-nowrap': compact,
      })}
    >
      {CAMERA_BAR_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-label={preset.label}
          aria-checked={cameraPreset === preset.id}
          onClick={() => {
            setCameraPreset({ cameraPreset: preset.id })
          }}
          className={cn('min-h-11', chromeTextClass(), {
            'text-flv-accent': cameraPreset === preset.id,
            'text-flv-muted hover:text-flv-accent': cameraPreset !== preset.id,
          })}
        >
          {compact ? (COMPACT_LABELS[preset.id] ?? preset.label) : preset.label}
        </button>
      ))}
    </RadioGroup>
  )
}
