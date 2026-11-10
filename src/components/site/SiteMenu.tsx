import { Menu, X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { buttonClass } from '../ui/Button'

/**
 * The landing page's links on a phone, where they don't fit the header.
 * A plain disclosure: Escape or a tap elsewhere closes it.
 */
export function SiteMenu({ children }: { children: ReactNode }) {
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

  return (
    <div ref={root} className="relative md:hidden">
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
        <nav aria-label="Site" className="flex flex-col font-body text-sm">
          {children}
        </nav>
      </div>
    </div>
  )
}
