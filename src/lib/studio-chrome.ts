export const CLOTH_LIST_ID = 'cloth-list'

export function nextClothOpen({
  clothOpen,
  action,
}: {
  clothOpen: boolean
  action: 'toggle' | 'apply-fabric' | 'select-part'
}) {
  if (action === 'toggle') {
    return !clothOpen
  }

  return clothOpen
}

export function clothListVisibilityClass({
  clothOpen,
}: {
  clothOpen: boolean
}) {
  return {
    hidden: !clothOpen,
    flex: clothOpen,
  }
}

export function clothSheetHeightClass({
  clothOpen,
}: {
  clothOpen: boolean
}) {
  return {
    'max-h-[min(28vh,16rem)] overflow-hidden': clothOpen,
  }
}

export function coverHeaderSpacerClass() {
  return 'h-[calc(3.5rem+max(0.75rem,env(safe-area-inset-top)))] shrink-0 lg:hidden'
}

export function lookSheetFrameClass() {
  return 'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[min(58vh,28rem)] flex-col bg-gradient-to-t from-flv-paper via-flv-paper/80 to-transparent px-4 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
}

export function lookSheetBodyClass() {
  return 'pointer-events-auto flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:gap-4'
}

/**
 * Studio layout at lg (E12 #163). The tool and publish panels own a
 * right-hand column (`STUDIO_TOOL_COLUMN`), the header spans the rest, and
 * the Draw/scene grid starts below the header's measured bottom
 * (`STUDIO_CHROME_BOTTOM_VAR`, set by the create route). Nothing overlays
 * the panel canvases.
 */
export const STUDIO_TOOL_COLUMN = '22rem'
export const STUDIO_CHROME_BOTTOM_VAR = '--studio-chrome-bottom'
export const STUDIO_TOP_VAR = '--studio-top'

/** Fills the viewport below the sticky site header instead of overflowing it. */
export function studioSectionClass() {
  return 'relative h-[calc(100dvh_-_var(--studio-top,0px))] min-h-[30rem] overflow-hidden'
}

export function studioHeaderClass() {
  return 'pointer-events-auto flex shrink-0 flex-col gap-2 bg-gradient-to-b from-flv-paper/90 to-transparent px-4 pt-1 pb-3 lg:absolute lg:top-4 lg:right-[22rem] lg:left-6 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-2 lg:bg-none lg:px-0 lg:pt-0 lg:pb-0'
}

export function dualStudioGridClass() {
  return 'grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(20rem,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_22rem] lg:gap-3 lg:pt-[calc(var(--studio-chrome-bottom,6rem)_+_0.75rem)] lg:pl-3'
}

/**
 * Below lg the Draw view puts its one panel canvas in the page flow,
 * between the header and the tools, and the overlay scrolls.
 */
export function studioOverlayClass({ drawInFlow }: { drawInFlow: boolean }) {
  return drawInFlow
    ? 'pointer-events-auto absolute inset-0 z-20 flex flex-col overflow-y-auto overscroll-contain bg-flv-paper'
    : 'pointer-events-none absolute inset-0 z-20 flex flex-col lg:block'
}

export function studioPhoneDrawClass() {
  return 'flex h-[min(70dvh,34rem)] min-h-72 shrink-0 flex-col px-3 pb-2'
}

export function studioPhoneToolsClass({ drawInFlow = false }: { drawInFlow?: boolean } = {}) {
  // With the Draw canvas in flow the whole column scrolls, so tools keep their height.
  if (drawInFlow) {
    return 'pointer-events-auto flex shrink-0 flex-col gap-2 px-3'
  }

  return 'pointer-events-auto flex max-h-[min(32vh,18rem)] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 lg:absolute lg:top-4 lg:right-6 lg:bottom-40 lg:w-72 lg:max-h-none lg:px-0'
}

export function studioPhonePublishClass() {
  return 'pointer-events-auto flex max-h-[min(72vh,42rem)] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:absolute lg:right-6 lg:bottom-4 lg:w-80 lg:max-h-[min(78vh,44rem)] lg:px-0 lg:pb-0'
}

export function railFrameClass() {
  return 'flv-panel flex w-full flex-col gap-3 p-3'
}

export function chromeKickerClass() {
  return 'font-body text-xs tracking-[0.18em] text-flv-accent uppercase'
}

export function chromeTextClass() {
  return 'font-body text-xs tracking-[0.08em] text-flv-ink uppercase'
}

export function chromeMutedClass() {
  return 'font-body text-xs tracking-[0.06em] text-flv-muted'
}

export function emptyStepClass() {
  return 'flv-panel flex flex-col gap-2 p-4'
}
