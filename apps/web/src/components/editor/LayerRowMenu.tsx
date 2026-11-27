import type { LucideIcon } from 'lucide-react'
import { type HTMLAttributes, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { chromeTextClass } from '../../lib/studio-chrome'

/**
 * True once a scrolling box between the button and the page has scrolled
 * it out of sight: the rail clips it while it is still inside the window.
 */
function clipped({ element, box }: { element: HTMLElement; box: DOMRect }) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent)

    if (/(auto|scroll|hidden|clip)/.test(`${overflowX} ${overflowY}`)) {
      const frame = parent.getBoundingClientRect()

      if (box.bottom <= frame.top || box.top >= frame.bottom || box.right <= frame.left || box.left >= frame.right) {
        return true
      }
    }
  }

  return false
}

export type LayerMenuItem = {
  /** What a press does, as a screen reader hears it ("Rename Headline"). */
  label: string
  /** The short text the menu shows ("Rename"). */
  text: string
  icon: LucideIcon
  /** The key that does the same, shown beside it. */
  hint?: string
  /** `data-layer-control`, kept from the old row so focus and tests find it. */
  control?: string
  onSelect: () => void
  danger?: boolean
} & Pick<HTMLAttributes<HTMLButtonElement>, 'aria-disabled' | 'aria-describedby' | 'title'>

/**
 * A layer row's secondary actions (UX review, 26 Nov): a small popover
 * under the row's "More" button, fixed to the viewport so the rail's own
 * scroll does not clip it. Arrow keys move between the actions, Esc or a
 * press elsewhere closes it and focus goes back to the button. The actions
 * are plain buttons in a labelled group (a disclosure), so their names
 * read as they did in the row.
 */
export function LayerRowMenu({
  id,
  label,
  anchor,
  items,
  onClose,
}: {
  id: string
  label: string
  anchor: HTMLElement
  items: LayerMenuItem[]
  onClose: ({ refocus }: { refocus: boolean }) => void
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null)

  // Places the menu under its button, flipped above when it would run off
  // the bottom. Returns false once the button has left the screen or its rail's view.
  const measure = useCallback(() => {
    const box = anchor.getBoundingClientRect()

    if (!anchor.isConnected || box.bottom < 0 || box.top > window.innerHeight || clipped({ element: anchor, box })) {
      return false
    }

    const height = panel.current?.offsetHeight ?? 0
    const below = box.bottom + 4
    const top = below + height > window.innerHeight - 8 && box.top - height - 4 > 8 ? box.top - height - 4 : below
    setPlace({ top, right: Math.max(8, window.innerWidth - box.right) })
    return true
  }, [anchor])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  // Focus the first action once the menu is placed (hidden, it takes no focus).
  const placed = place !== null
  useEffect(() => {
    if (placed) {
      panel.current?.querySelector<HTMLElement>('button')?.focus()
    }
  }, [placed])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node

      if (!panel.current?.contains(target) && !anchor.contains(target)) {
        onClose({ refocus: false })
      }
    }

    // The rail scrolls (by hand, or to keep the selected layer in view):
    // the menu follows its row, and closes only once the row is off screen.
    function onScroll(event: Event) {
      if (!panel.current?.contains(event.target as Node) && !measure()) {
        onClose({ refocus: false })
      }
    }

    function onResize() {
      onClose({ refocus: false })
    }

    // Esc closes it from the menu or its button. The studio's window
    // listener skips a handled key, so the selection stays.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose({ refocus: true })
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchor, measure, onClose])

  return (
    <div
      ref={panel}
      id={id}
      role="group"
      aria-label={label}
      data-testid="layer-row-menu"
      style={place ? { top: place.top, right: place.right } : { visibility: 'hidden' }}
      className="flv-panel fixed z-50 flex w-52 flex-col bg-white py-1 shadow-[0_12px_32px_rgb(0_0_0/0.16)]"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
          return
        }

        event.preventDefault()
        // The studio's arrow keys would otherwise nudge the selected item.
        event.stopPropagation()
        const buttons = [...(panel.current?.querySelectorAll<HTMLElement>('button') ?? [])]
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }}
      onBlur={(event) => {
        // Tabbing out of the menu closes it.
        const next = event.relatedTarget as Node | null

        if (next && !panel.current?.contains(next) && !anchor.contains(next)) {
          onClose({ refocus: false })
        }
      }}
    >
      {items.map(({ label: itemLabel, text, icon: Icon, hint, control, onSelect, danger, ...aria }) => (
        <button
          key={itemLabel}
          type="button"
          aria-label={itemLabel}
          data-layer-control={control}
          {...aria}
          onClick={() => {
            if (aria['aria-disabled']) {
              return
            }

            onSelect()
          }}
          className={cn(
            'flex min-h-9 w-full items-center gap-2 px-3 text-left hover:bg-flv-paper focus-visible:bg-flv-paper aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent pointer-coarse:min-h-11',
            chromeTextClass(),
            danger ? 'text-flv-accent' : 'text-flv-ink',
          )}
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">{text}</span>
          {hint ? (
            <kbd aria-hidden className="font-body text-[0.7rem] text-flv-muted">
              {hint}
            </kbd>
          ) : null}
        </button>
      ))}
    </div>
  )
}
