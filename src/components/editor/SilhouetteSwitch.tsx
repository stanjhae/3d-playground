import { cn } from '../../lib/cn'
import type { GarmentId } from '../../lib/design-schema'
import { resolveGarmentId } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { listRailGarments } from '../../lib/garments'

export function SilhouetteSwitch({
  garmentId,
}: {
  garmentId?: GarmentId
}) {
  const storeId = useEditorStore((state) => state.garmentId)
  const setGarmentId = useEditorStore((state) => state.setGarmentId)
  const current = resolveGarmentId({ garmentId: garmentId ?? storeId })

  return (
    <nav
      aria-label="House forms"
      className="flex w-full max-w-full gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory lg:max-w-[min(100%,36rem)]"
    >
      {listRailGarments().map((garment) => {
        const isCurrent = current === garment.id

        return (
          <button
            key={garment.id}
            type="button"
            aria-pressed={isCurrent ? 'true' : 'false'}
            onClick={() => {
              setGarmentId({ garmentId: garment.id })
            }}
            className={cn(
              'min-h-11 shrink-0 snap-start whitespace-nowrap font-display text-xs tracking-[0.18em] uppercase',
              {
                'text-brass': isCurrent,
                'text-ivory-muted hover:text-brass': !isCurrent,
              },
            )}
          >
            {garment.label}
          </button>
        )
      })}
    </nav>
  )
}
