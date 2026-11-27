/**
 * Scrolls to an in-page section: smoothly unless less motion was asked for.
 * Only for link clicks; focus moves stay instant so focus is always in view.
 */
export function scrollToSection({ id }: { id: string }) {
  const target = document.getElementById(id)

  if (!target) {
    return false
  }

  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  return true
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
