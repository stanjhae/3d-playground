import { useEffect, useState } from 'react'

/**
 * Which of the page's sections the reader is in, for the header to mark
 * (scroll-spy). A section counts once it crosses the upper third of the
 * viewport; above the first one, none is active.
 */
export function useActiveSection({ ids }: { ids: readonly string[] }) {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(' ')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return
    }

    const sections = key
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    const showing = new Set<string>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            showing.add(entry.target.id)
          } else {
            showing.delete(entry.target.id)
          }
        }

        // The first section in page order that is in the band wins.
        setActive(sections.find((section) => showing.has(section.id))?.id ?? null)
      },
      // A band across the upper part of the viewport, below the sticky header.
      { rootMargin: '-20% 0px -60% 0px' },
    )

    for (const section of sections) {
      observer.observe(section)
    }

    return () => observer.disconnect()
  }, [key])

  return active
}
