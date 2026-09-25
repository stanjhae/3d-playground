import { useSyncExternalStore } from 'react'

const LG_QUERY = '(min-width: 1024px)'

export function subscribeLgUp({
  onStoreChange,
}: {
  onStoreChange: () => void
}) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {}
  }

  const media = window.matchMedia(LG_QUERY)
  media.addEventListener('change', onStoreChange)
  return () => {
    media.removeEventListener('change', onStoreChange)
  }
}

export function lgUpSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }

  return window.matchMedia(LG_QUERY).matches
}

export function lgUpServerSnapshot() {
  return false
}

export function useLgUp() {
  return useSyncExternalStore(
    (onStoreChange) => subscribeLgUp({ onStoreChange }),
    lgUpSnapshot,
    lgUpServerSnapshot,
  )
}
