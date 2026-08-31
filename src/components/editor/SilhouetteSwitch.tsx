import type { GarmentId } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'

export function SilhouetteSwitch({
  garmentId,
}: {
  garmentId?: GarmentId
}) {
  const storeId = useEditorStore((state) => state.garmentId)
  const setGarmentId = useEditorStore((state) => state.setGarmentId)
  const current = garmentId ?? storeId

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => {
          setGarmentId({ garmentId: 'column' })
        }}
        className={
          current === 'column'
            ? 'min-h-11 font-display text-xs tracking-[0.18em] text-brass uppercase'
            : 'min-h-11 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass'
        }
      >
        Column
      </button>
      <button
        type="button"
        onClick={() => {
          setGarmentId({ garmentId: 'jacket' })
        }}
        className={
          current === 'jacket'
            ? 'min-h-11 font-display text-xs tracking-[0.18em] text-brass uppercase'
            : 'min-h-11 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass'
        }
      >
        Jacket
      </button>
    </div>
  )
}
