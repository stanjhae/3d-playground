import { cn } from '../../lib/cn'
import {
  useEditorStore,
  type CameraPreset,
} from '../../lib/editor-store'
import { showsPaintPane } from '../../lib/create-steps'
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

export const ORBIT_DRAW_NOTE = 'Orbit turns the garment. Pick a view, such as Front, to draw on it.'

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
  // With Draw on, Orbit turns the garment instead of drawing on it: say so,
  // and how to draw on it again (third outside test pass).
  const orbitTurnsInstead = useEditorStore(
    (state) =>
      state.cameraPreset === 'orbit' &&
      state.designTool === 'draw' &&
      !state.rotateView &&
      showsPaintPane({ step: state.createStep }),
  )

  return (
    <div className="relative max-w-full">
      {orbitTurnsInstead ? (
        // Above the bar, out of the layout and the pointer's way.
        <p
          data-orbit-note
          className="pointer-events-none absolute inset-x-0 bottom-full mb-1 text-center font-body text-xs text-flv-ink"
        >
          <span className="rounded-md bg-flv-paper/92 px-2 py-1">{ORBIT_DRAW_NOTE}</span>
        </p>
      ) : null}
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
    </div>
  )
}
