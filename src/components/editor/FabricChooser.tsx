import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { FABRIC_MAP_SRC } from '../../lib/fabric-maps'
import { BASE_FABRIC_IDS, type BaseFabricId, getFabricById } from '../../lib/fabrics'
import { useGarmentMaterialProbe } from '../../lib/garment-material-probe'
import { chromeTextClass } from '../../lib/studio-chrome'

/** The picker's buttons: each base fabric in `order`, the saved one pressed. */
export function fabricOptions({
  selected,
  order = BASE_FABRIC_IDS,
}: {
  selected: BaseFabricId | null
  order?: readonly BaseFabricId[]
}) {
  return order.flatMap((id) => {
    const preset = getFabricById({ id })

    if (!preset) {
      return []
    }

    const map = preset.mapId ? FABRIC_MAP_SRC[preset.mapId as keyof typeof FABRIC_MAP_SRC] : undefined
    return [{ id, preset, map, pressed: selected === id }]
  })
}

/**
 * The garment's cloth (writer W), one button per base fabric. The one
 * source of truth is the document's `base.fabric`: the Color step and the
 * Pattern editor both show and set it, a pick is one undo step, and a
 * reload shows what was saved. A fabric changes the finish, texture and
 * relief, never the chosen colour, so each swatch is its texture in that
 * colour.
 */
export function FabricGrid({
  order = BASE_FABRIC_IDS,
  onPicked,
}: {
  order?: readonly BaseFabricId[]
  onPicked?: ({ name }: { name: string }) => void
}) {
  const baseFabricId = useEditorStore((state) => state.baseFabricId)
  const setBaseFabric = useEditorStore((state) => state.setBaseFabric)
  const tint = useEditorStore((state) => state.overrides.find((entry) => entry.meshName === 'body')?.color ?? '#f3efe6')

  return (
    <div className="grid grid-cols-2 gap-2">
      {fabricOptions({ selected: baseFabricId, order }).map(({ id, preset, map, pressed: selected }) => {
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            data-fabric-id={id}
            onClick={() => {
              setBaseFabric({ fabricId: id })
              onPicked?.({ name: preset.name })
            }}
            className={cn('relative flex min-h-11 items-center gap-2 rounded-xl border px-2 py-1.5', chromeTextClass(), {
              'border-flv-accent text-flv-accent': selected,
              'border-flv-line text-flv-ink hover:text-flv-accent': !selected,
            })}
          >
            <span
              aria-hidden
              className="size-7 shrink-0 rounded-full border border-black/10"
              style={{
                backgroundColor: tint,
                ...(map ? { backgroundImage: `url(${map})`, backgroundSize: '200%', backgroundBlendMode: 'multiply' } : {}),
                ...(preset.opacity !== undefined ? { opacity: Math.max(0.5, preset.opacity) } : {}),
              }}
            />
            {preset.name}
            {selected ? <span aria-hidden className="absolute top-1 right-1.5 text-flv-accent">✓</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * What the 3D cloth is drawn with, as `data-*` (see garment-material-probe):
 * hidden, for tests and support.
 */
export function GarmentMaterialHint() {
  const probe = useGarmentMaterialProbe((state) => state.probe)

  return (
    <span
      hidden
      data-testid="garment-material"
      data-map-id={probe?.mapId ?? ''}
      data-roughness={probe?.roughness ?? ''}
      data-metalness={probe?.metalness ?? ''}
      data-sheen={probe?.sheen ?? ''}
      data-clearcoat={probe?.clearcoat ?? ''}
      data-opacity={probe?.opacity ?? ''}
      data-detail={probe?.detailId ?? ''}
    />
  )
}
