import { useEffect, useRef, useState } from 'react'

import { useEditorStore } from '../../lib/editor-store'
import { useStudioMode } from '../../lib/studio-mode'
import {
  HINT_ANCHOR_ATTRIBUTE,
  HINT_KEEP_CLEAR_SELECTOR,
  type HintBox,
  type HintSide,
  allHintsHidden,
  hintPosition,
  hintBoxesOverlap as overlapsBox,
  nextHint,
  placeHint,
  readDismissedHints,
  writeDismissedHints,
} from '../../lib/studio-hints'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'
import { cn } from '../../lib/cn'

function hintStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function boxOf({ element }: { element: Element }): HintBox {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** The part of `box` not hidden by a scrolling or clipping ancestor. */
function visiblePart({ element, box }: { element: Element; box: HintBox }) {
  let { left, top } = box
  let right = box.left + box.width
  let bottom = box.top + box.height

  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent)

    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const clip = parent.getBoundingClientRect()
      left = Math.max(left, clip.left)
      top = Math.max(top, clip.top)
      right = Math.min(right, clip.right)
      bottom = Math.min(bottom, clip.bottom)
    }
  }

  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * The shown part of the control a hint is about; null when none shows. When
 * several are marked (the panels, and on a phone the switch that opens them),
 * the last one shown is the control itself.
 */
function findAnchor({ id }: { id: string }) {
  for (const element of [...document.querySelectorAll(`[${HINT_ANCHOR_ATTRIBUTE}~="${id}"]`)].reverse()) {
    const full = boxOf({ element })

    if (full.width > 0 && full.height > 0) {
      const box = visiblePart({ element, box: full })

      if (box.width > 0 && box.height > 0) {
        return box
      }
    }
  }

  return null
}

function onScreen({ box, viewport }: { box: HintBox; viewport: { width: number; height: number } }) {
  return box.top < viewport.height && box.top + box.height > 0 && box.left < viewport.width && box.left + box.width > 0
}

/** Why the hint is where it is; only the first two are looked at again. */
type Decision = {
  id: string
  viewport: string
  reason: 'no-anchor' | 'off-screen' | 'placed' | 'no-room'
  side: HintSide | null
}

/**
 * One short hint at a time, next to the control it is about (P3), with that
 * control outlined. Where the card would cover the work, the step buttons or
 * the control itself, it stays in the tools rail and the outline still shows
 * which control it means. Dismissed hints stay dismissed in this browser.
 */
/** Below the studio's lg breakpoint hints dock in the tools, never float. */
const DOCKED_BELOW_WIDTH = 1024

export function StudioHint() {
  const step = useEditorStore((state) => state.createStep)
  const [dismissed, setDismissed] = useState(() => readDismissedHints({ storage: hintStorage() }))
  const pro = useStudioMode((state) => state.pro)
  const hint = pro ? null : nextHint({ step, dismissed })
  const card = useRef<HTMLElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const decision = useRef<Decision | null>(null)
  const [side, setSide] = useState<HintSide | null>(null)
  const hintId = hint?.id ?? null

  useEffect(() => {
    if (!hintId) {
      return
    }

    // Measured only when something moves, never every frame: the studio
    // stays idle while nothing changes (render-idle.spec).
    let frame = 0
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(tick)
      }
    }
    const tick = () => {
      frame = 0
      const element = card.current

      if (!element) {
        return
      }

      const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight }
      const viewportKey = `${viewport.width}x${viewport.height}`
      const anchor = findAnchor({ id: hintId })
      const visible = anchor !== null && onScreen({ box: anchor, viewport })
      const keepClear = () =>
        [...document.querySelectorAll(HINT_KEEP_CLEAR_SELECTOR)]
          .filter((each) => !element.contains(each))
          .map((each) => boxOf({ element: each }))
          .filter((box) => box.width > 0 && box.height > 0)
      const last = decision.current
      // A floating card that something has since appeared under goes back to the rail.
      const nowCovering =
        last?.side && anchor
          ? (() => {
              const placed = hintPosition({
                side: last.side,
                anchor,
                card: { width: element.offsetWidth, height: element.offsetHeight },
                viewport,
              })
              const box = { left: placed.left, top: placed.top, width: element.offsetWidth, height: element.offsetHeight }
              return keepClear().some((other) => overlapsBox(box, other))
            })()
          : false
      const stale =
        nowCovering ||
        !last ||
        last.id !== hintId ||
        last.viewport !== viewportKey ||
        (last.reason === 'no-anchor' && anchor !== null) ||
        (last.reason === 'off-screen' && visible) ||
        (last.side !== null && anchor === null)

      if (stale) {
        // The floating card is a fixed width; in the rail it is taller only
        // when the rail is narrower, so allow a little for that.
        const size = {
          width: Math.min(288, viewport.width - 32),
          height: element.offsetHeight + 24,
        }
        // On a phone the card stays in the tools: floating, it sat over the
        // garment, the little room there is (tester feedback).
        const placed =
          anchor && visible && viewport.width >= DOCKED_BELOW_WIDTH
            ? placeHint({
                anchor,
                card: size,
                viewport,
                keepClear: keepClear(),
              })
            : null
        decision.current = {
          id: hintId,
          viewport: viewportKey,
          reason: !anchor ? 'no-anchor' : !visible ? 'off-screen' : placed ? 'placed' : 'no-room',
          side: placed?.side ?? null,
        }
        setSide(placed?.side ?? null)
      }

      if (ring.current) {
        ring.current.style.display = anchor ? 'block' : 'none'

        if (anchor) {
          ring.current.style.transform = `translate(${anchor.left - 4}px, ${anchor.top - 4}px)`
          ring.current.style.width = `${anchor.width + 8}px`
          ring.current.style.height = `${anchor.height + 8}px`
        }
      }

      const floating = decision.current?.side

      if (floating && anchor) {
        const placed = hintPosition({
          side: floating,
          anchor,
          card: { width: element.offsetWidth, height: element.offsetHeight },
          viewport,
        })
        element.style.transform = `translate(${placed.left}px, ${placed.top}px)`
        element.style.setProperty('--hint-arrow', `${placed.arrow}px`)
      } else {
        element.style.removeProperty('transform')
      }
    }

    tick()
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    // Text, fonts and the card itself change size without a DOM change; the
    // controls around them then move. Watch the sizes that move them.
    const resized = new ResizeObserver(schedule)
    resized.observe(document.documentElement)
    const watched = new Set<Element>()
    const watchSizes = () => {
      for (const element of [
        card.current,
        ...document.querySelectorAll(`[${HINT_ANCHOR_ATTRIBUTE}~="${hintId}"], ${HINT_KEEP_CLEAR_SELECTOR}`),
      ]) {
        if (element && !watched.has(element)) {
          watched.add(element)
          resized.observe(element)
        }
      }
    }
    watchSizes()
    // Controls come and go, and move, as the studio changes. The card's and
    // ring's own position writes are `style`, which is not watched.
    const changed = new MutationObserver(() => {
      watchSizes()
      schedule()
    })
    changed.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', HINT_ANCHOR_ATTRIBUTE],
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      resized.disconnect()
      changed.disconnect()
    }
  }, [hintId])

  if (!hint) {
    return null
  }

  function update(next: string[]) {
    decision.current = null
    setDismissed(next)
    writeDismissedHints({ storage: hintStorage(), dismissed: next })
  }

  const gotIt = () => update([...dismissed, hint.id])

  return (
    <>
      <aside
        ref={card}
        aria-label="Hint"
        data-hint-for={hint.id}
        data-hint-side={side ?? 'rail'}
        className={
          side
            ? // The rail frame, at a card's width.
              'flv-panel fixed top-0 left-0 z-40 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-3 p-3 shadow-[0_12px_32px_rgb(0_0_0/0.16)]'
            : railFrameClass()
        }
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            gotIt()
          }
        }}
      >
        {side ? (
          <span
            aria-hidden
            className={cn(
              'absolute size-3 rotate-45 border-flv-line bg-white',
              side === 'below' && '-top-[7px] left-[calc(var(--hint-arrow)-6px)] border-t border-l',
              side === 'above' && '-bottom-[7px] left-[calc(var(--hint-arrow)-6px)] border-r border-b',
              side === 'right' && 'top-[calc(var(--hint-arrow)-6px)] -left-[7px] border-b border-l',
              side === 'left' && 'top-[calc(var(--hint-arrow)-6px)] -right-[7px] border-t border-r',
            )}
          />
        ) : null}
        <p className={chromeKickerClass()}>{hint.title}</p>
        <p className={chromeMutedClass()}>{hint.text}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={cn('min-h-9 text-flv-ink underline-offset-2 hover:underline', chromeTextClass())}
            onClick={gotIt}
          >
            Got it
          </button>
          <button
            type="button"
            className={cn('min-h-9 text-flv-muted underline-offset-2 hover:underline', chromeTextClass())}
            onClick={() => update(allHintsHidden())}
          >
            Hide all hints
          </button>
        </div>
      </aside>
      <div
        ref={ring}
        aria-hidden
        data-hint-ring
        className="pointer-events-none fixed top-0 left-0 z-30 hidden rounded-[calc(var(--radius-flv)+4px)] border-2 border-flv-accent"
      />
    </>
  )
}
