import { cn } from '../../lib/cn'
import { FLV_COPY } from '../../lib/flv-copy'

export function ConceptPreviewBadge({
  className,
}: {
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-flv-line bg-white px-2.5 py-1 font-body text-[0.6rem] tracking-[0.14em] text-flv-muted uppercase',
        className,
      )}
    >
      {FLV_COPY.conceptPreview}
    </span>
  )
}
