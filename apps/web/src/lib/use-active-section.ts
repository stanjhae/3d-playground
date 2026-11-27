import { useEffect, useState } from 'react'

/** The band the reader is reading in: from 20% to 40% down the viewport, below the sticky header. */
const BAND = { top: 0.2, bottom: 0.4 } as const

/**
 * The section covering most of the reading band, or null above the first.
 * The first section in page order used to win, so one that only grazed the
 * band's top edge kept the highlight after its successor filled the band.
 */
export function sectionInBand({
  sections,
  viewportHeight,
  atEnd = false,
}: {
  sections: readonly { id: string; top: number; bottom: number }[]
  viewportHeight: number
  /** Scrolled as far as the page goes: a last section that's on screen wins, though it can't reach the band. */
  atEnd?: boolean
}) {
  const last = sections[sections.length - 1]

  if (atEnd && last && last.top < viewportHeight && last.bottom > 0) {
    return last.id
  }

  const top = viewportHeight * BAND.top
  const bottom = viewportHeight * BAND.bottom
  let best: string | null = null
  let most = 0

  for (const section of sections) {
    const covered = Math.min(bottom, section.bottom) - Math.max(top, section.top)

    if (covered > most) {
      most = covered
      best = section.id
    }
  }

  return best
}

/**
 * Which of the page's sections the reader is in, for the header to mark
 * (scroll-spy). Measured on scroll, a frame at a time: a handful of
 * sections, so it costs nothing, and it never goes stale between edges.
 */
export function useActiveSection({ ids }: { ids: readonly string[] }) {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(' ')

  useEffect(() => {
    const sectionIds = key.split(' ')
    let frame = 0

    // Looked up on every measure, not once: the header lives in the app
    // shell and can mount before the landing's sections exist (a visit from
    // another page, the landing's code still loading) or while the
    // prerendered copy is still in place, which is then removed. A list
    // taken once stays empty or detached, and nothing is ever underlined.
    const measure = () => {
      frame = 0
      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null && element.isConnected)
        .map((element) => {
          const box = element.getBoundingClientRect()
          return { id: element.id, top: box.top, bottom: box.bottom }
        })

      setActive(
        sectionInBand({
          sections,
          viewportHeight: window.innerHeight,
          atEnd: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
        }),
      )
    }
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(measure)
      }
    }

    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // The sections arriving (or the prerendered copy leaving) moves no
    // scrollbar, so measure again when the page's elements change.
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [key])

  return active
}
