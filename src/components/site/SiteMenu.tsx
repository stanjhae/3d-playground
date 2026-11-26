import { Menu, X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { buttonClass } from '../ui/Button'

export const MENU_LINK_CLASS = 'flex min-h-11 items-center rounded-lg px-3 text-flv-ink hover:bg-flv-soft'

/** A menu link for the page on screen: marked by colour and an underline, not colour alone. */
export const MENU_LINK_CURRENT_CLASS = 'font-medium text-flv-accent underline decoration-flv-accent decoration-2 underline-offset-4'

export function menuLinkClass({ current = false }: { current?: boolean } = {}) {
  return cn(MENU_LINK_CLASS, { [MENU_LINK_CURRENT_CLASS]: current })
}

/**
 * The header links that don't fit a phone (the landing's sections; the app
 * header's Home, Look and account). A plain disclosure: Escape or a tap
 * elsewhere closes it. It shows below `hideFrom`, where the header's own
 * links take over.
 */
export function SiteMenu({
  children,
  hideFrom = 'lg',
  label = 'Site',
}: {
  children: ReactNode
  hideFrom?: 'md' | 'lg'
  /** The menu's navigation name; the app header's is not the whole site. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // Up to lg (or md), where the header's own links take over: no width is left without them.
  return (
    <div ref={root} className={cn('relative', hideFrom === 'md' ? 'md:hidden' : 'lg:hidden')}>
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        className={buttonClass({ variant: 'quiet' })}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
      </button>
      {/* Any link inside takes the person away, so a click closes the menu. */}
      <div
        id={panelId}
        hidden={!open}
        className="flv-panel absolute top-full right-0 z-40 mt-2 w-56 bg-white p-2"
        onClick={() => setOpen(false)}
      >
        {/* Closed, its links are not in the page at all: the header's own
            copies of them are then the only ones a search or a reader finds. */}
        {open ? (
          <nav aria-label={label} className="flex flex-col font-body text-sm">
            {children}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
