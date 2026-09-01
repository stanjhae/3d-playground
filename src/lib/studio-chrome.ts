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

export function coverHeaderSpacerClass() {
  return 'h-[calc(3.5rem+max(0.75rem,env(safe-area-inset-top)))] shrink-0 lg:hidden'
}

export function lookSheetFrameClass() {
  return 'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[min(58vh,28rem)] flex-col bg-gradient-to-t from-atelier via-atelier/80 to-transparent px-4 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-none sm:px-6 sm:pt-20 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
}

export function lookSheetBodyClass() {
  return 'pointer-events-auto flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:flex-none sm:gap-4 sm:overflow-visible'
}
