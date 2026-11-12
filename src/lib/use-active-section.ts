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
}: {
  sections: readonly { id: string; top: number; bottom: number }[]
  viewportHeight: number
}) {
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
    const elements = key
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    let frame = 0

    const measure = () => {
      frame = 0
      setActive(
        sectionInBand({
          sections: elements.map((element) => {
            const box = element.getBoundingClientRect()
            return { id: element.id, top: box.top, bottom: box.bottom }
          }),
          viewportHeight: window.innerHeight,
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

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [key])

  return active
}
