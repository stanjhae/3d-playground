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
  return 'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[min(58vh,28rem)] flex-col bg-gradient-to-t from-atelier via-atelier/80 to-transparent px-4 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
}

export function lookSheetBodyClass() {
  return 'pointer-events-auto flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:gap-4'
}

export function studioPhoneToolsClass() {
  return 'pointer-events-auto flex max-h-[min(32vh,18rem)] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 lg:absolute lg:top-24 lg:right-6 lg:bottom-40 lg:w-72 lg:max-h-none lg:px-0'
}

export function studioPhonePublishClass() {
  return 'pointer-events-auto flex max-h-[min(72vh,42rem)] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:absolute lg:right-6 lg:bottom-4 lg:w-80 lg:max-h-[min(78vh,44rem)] lg:px-0 lg:pb-0'
}

export function railFrameClass() {
  return 'flex w-full flex-col gap-3 border border-atelier-line bg-atelier/92 p-3'
}

export function chromeKickerClass() {
  return 'font-display text-xs tracking-[0.22em] text-brass uppercase'
}

export function chromeTextClass() {
  return 'font-body text-xs tracking-[0.08em] uppercase'
}
