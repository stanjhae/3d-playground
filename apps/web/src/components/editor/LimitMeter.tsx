import {
  type CanonicalDocument,
  type CanonicalPanelId,
  panelIdsOf,
} from '../../lib/canonical-document'
import { cn } from '../../lib/cn'
import { isCanonicalGarment } from '../../lib/concept-flags'
import {
  type LimitCounter,
  type LimitKind,
  LIMIT_MAX,
  nearLimit,
  panelLimitCounters,
} from '../../lib/editor-canonical'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { canonicalPanel } from '../../lib/render-projection'
import { chromeMutedClass } from '../../lib/studio-chrome'
import { resolveTemplate } from '../../lib/template-manifest'

const PANEL_LABELS: Partial<Record<CanonicalPanelId, string>> = {
  front: HOUSE_COPY.front,
  back: HOUSE_COPY.back,
  left: HOUSE_COPY.wearerLeft,
  right: HOUSE_COPY.wearerRight,
}

/** The tee's house labels, else the template's own name for the panel. */
function panelLabel({ document, panel }: { document: CanonicalDocument; panel: CanonicalPanelId }) {
  const resolved = resolveTemplate(document.template)
  return (resolved.ok && resolved.manifest.garmentId !== 'tee' ? resolved.manifest.regions[panel]?.label : undefined)
    ?? PANEL_LABELS[panel]
    ?? panel
}

const LIMIT_LABELS: Record<LimitKind, string> = {
  layers: 'Layers',
  strokes: 'Strokes in layer',
  points: 'Points in stroke',
  text: 'Characters',
}

/**
 * Counters for each panel once it nears a v2 limit, and the
 * reason the last command was refused (#162). Silent the rest of the time.
 */
export function LimitMeter() {
  const v2Tee = useEditorStore((state) => isCanonicalGarment({ garmentId: state.garmentId }))
  // The canonical document is read outside the store; the revision says when.
  useEditorStore((state) => state.revision)
  const paintPanel = useEditorStore((state) => state.paintPanel)
  const activePoints = useEditorStore((state) => state.activeStroke?.points.length ?? 0)
  const limitNotice = useEditorStore((state) => state.limitNotice)

  if (!v2Tee) {
    return null
  }

  // Every panel near a limit shows, the one being edited first.
  const document = getCanonicalDocument()
  const active = canonicalPanel({ renderPanel: paintPanel, template: document.template })
  const near = [active, ...panelIdsOf({ document }).filter((panel) => panel !== active)].flatMap((panel) =>
    panelLimitCounters({ document, panel })
      .map(
        (counter): LimitCounter =>
          counter.kind === 'points' && panel === active
            ? { ...counter, used: Math.max(counter.used, activePoints) }
            : counter,
      )
      .filter((counter) => nearLimit({ counter })),
  )

  if (near.length === 0 && !limitNotice) {
    return null
  }

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1" data-testid="limit-meter">
      {near.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {near.map((counter) => (
            <li key={`${counter.panel}-${counter.kind}`}>
              <span
                // chromeTextClass's ink colour would fight the state colour.
                className={cn('font-body text-xs tracking-[0.08em] uppercase', {
                  'text-flv-accent': counter.used >= LIMIT_MAX[counter.kind],
                  'text-flv-muted': counter.used < LIMIT_MAX[counter.kind],
                })}
              >
                {panelLabel({ document, panel: counter.panel })} · {LIMIT_LABELS[counter.kind]} {counter.used} / {counter.max}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {limitNotice ? <p className={chromeMutedClass()}>{limitNotice}</p> : null}
    </div>
  )
}
