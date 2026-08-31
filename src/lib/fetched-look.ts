import type { Design } from './design-schema'

export function resolveFetchedLook({
  failed,
  design,
}: {
  failed: boolean
  design: Design | null
}): { status: 'ready' | 'missing' | 'error'; design: Design | null } {
  if (failed) {
    return { status: 'error', design: null }
  }

  if (!design) {
    return { status: 'missing', design: null }
  }

  return { status: 'ready', design }
}
