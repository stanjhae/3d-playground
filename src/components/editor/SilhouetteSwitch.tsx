import { cn } from '../../lib/cn'
import type { GarmentId } from '../../lib/design-schema'
import { resolveGarmentId } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import {
  garmentCredit,
  listRailGarments,
} from '../../lib/garments'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'

function FormGlyph({
  garmentId,
}: {
  garmentId: GarmentId
}) {
  if (garmentId === 'tee') {
    return (
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className="h-10 w-10 fill-current"
      >
        <path d="M16 10 L8 16 L12 20 L16 16 L16 38 L32 38 L32 16 L36 20 L40 16 L32 10 L28 14 L20 14 Z" />
      </svg>
    )
  }

  if (garmentId === 'gown' || garmentId === 'slip') {
    return (
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className="h-10 w-10 fill-current"
      >
        <path d="M20 8 L18 14 L12 40 L36 40 L30 14 L28 8 Z M22 8 L26 8 L26 12 L22 12 Z" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className="h-10 w-10 fill-current"
    >
      <path d="M14 12 L8 18 L12 22 L16 18 L16 40 L32 40 L32 18 L36 22 L40 18 L34 12 L28 16 L20 16 Z" />
    </svg>
  )
}

export function SilhouetteSwitch({
  garmentId,
}: {
  garmentId?: GarmentId
}) {
  const storeId = useEditorStore((state) => state.garmentId)
  const setGarmentId = useEditorStore((state) => state.setGarmentId)
  const current = resolveGarmentId({ garmentId: garmentId ?? storeId })
  const credit = garmentCredit({ garmentId: current })

  return (
    <div className="flex w-full max-w-full flex-col gap-2 lg:max-w-[min(100%,42rem)]">
      <nav
        aria-label="House forms"
        className="flex w-full gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory"
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
                'flex min-h-16 min-w-20 shrink-0 snap-start flex-col items-center justify-center gap-1 border px-3 py-2',
                chromeTextClass(),
                {
                  'border-brass text-brass': isCurrent,
                  'border-atelier-line text-ivory-muted hover:text-brass':
                    !isCurrent,
                },
              )}
            >
              <FormGlyph garmentId={garment.id} />
              <span>{garment.label}</span>
            </button>
          )
        })}
      </nav>
      {credit ? (
        <p className={cn('text-ivory-muted', chromeKickerClass())}>
          <a
            href={credit.href}
            rel="noopener noreferrer"
            target="_blank"
            className="hover:text-brass"
          >
            {credit.label}
          </a>
          {' · '}
          <a
            href={credit.licenseHref}
            rel="license noopener noreferrer"
            target="_blank"
            className="hover:text-brass"
          >
            {credit.license}
          </a>
        </p>
      ) : null}
    </div>
  )
}
