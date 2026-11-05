import { ImageUp, Pencil, Shapes, Type, type LucideIcon } from 'lucide-react'

import { cn } from '../../lib/cn'
import { type DesignTool, useStudioMode } from '../../lib/studio-mode'

const TOOLS: ReadonlyArray<{ id: DesignTool; label: string; icon: LucideIcon }> = [
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'graphics', label: 'Graphics', icon: Shapes },
  { id: 'upload', label: 'Upload', icon: ImageUp },
]

/** One tool at a time, each with its own panel below. */
export function DesignToolRail() {
  const designTool = useStudioMode((state) => state.designTool)
  const setDesignTool = useStudioMode((state) => state.setDesignTool)

  return (
    <div role="radiogroup" aria-label="Tools" className="flv-panel grid grid-cols-4 gap-1 p-1.5">
      {TOOLS.map((tool) => {
        const selected = tool.id === designTool
        const Icon = tool.icon

        return (
          <button
            key={tool.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              setDesignTool({ designTool: tool.id })
            }}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl font-body text-xs',
              {
                'bg-flv-soft font-medium text-flv-ink': selected,
                'text-flv-muted hover:bg-flv-soft hover:text-flv-ink': !selected,
              },
            )}
          >
            <Icon aria-hidden className={cn('size-5', { 'text-flv-accent': selected })} />
            {tool.label}
          </button>
        )
      })}
    </div>
  )
}
