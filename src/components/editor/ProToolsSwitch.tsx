import { useStudioMode } from '../../lib/studio-mode'
import { cn } from '../../lib/cn'

export function ProToolsSwitch() {
  const pro = useStudioMode((state) => state.pro)
  const setPro = useStudioMode((state) => state.setPro)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={pro}
      title="Shows numeric placement, brush detail, checkpoints and shortcuts"
      onClick={() => {
        setPro({ pro: !pro })
      }}
      className="inline-flex min-h-11 items-center gap-2 font-body text-sm whitespace-nowrap text-flv-muted hover:text-flv-ink"
    >
      <span
        aria-hidden
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', {
          'bg-flv-ink': pro,
          'bg-flv-line': !pro,
        })}
      >
        <span
          className={cn('absolute top-0.5 left-0 size-4 rounded-full bg-white shadow transition-transform', {
            'translate-x-4.5': pro,
            'translate-x-0.5': !pro,
          })}
        />
      </span>
      Pro tools
    </button>
  )
}
