import { cn } from './cn'

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

export function lookSheetFrameClass() {
  return 'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[min(58vh,28rem)] flex-col bg-gradient-to-t from-flv-paper via-flv-paper/80 to-transparent px-4 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-20 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
}

export function lookSheetBodyClass() {
  return 'pointer-events-auto flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:gap-4'
}

/**
 * Studio layout at lg (E12 #163). The header spans the page, and everything
 * else starts below its measured bottom (`STUDIO_CHROME_BOTTOM_VAR`, set by
 * the create route). One tool column (`STUDIO_TOOL_COLUMN`) sits left of the
 * panels on Design and right of the garment on every other step. Nothing
 * overlays the panel canvases.
 */
export const STUDIO_TOOL_COLUMN = '20rem'
export const STUDIO_CHROME_BOTTOM_VAR = '--studio-chrome-bottom'
export const STUDIO_TOP_VAR = '--studio-top'
/** Below lg, the height of the tools and publishing under the stage (measured by the create route). */
export const STUDIO_TOOLS_HEIGHT_VAR = '--studio-tools-height'

/**
 * Fills the viewport below the sticky site header instead of overflowing it.
 * With the Draw canvas in flow the overlay is the one scroller, so the
 * section never grows past the viewport: at 200% zoom a second, page-level
 * scroll would park focused controls under the sticky header (#163).
 */
export function studioSectionClass({ drawInFlow = false }: { drawInFlow?: boolean } = {}) {
  // `clip`, not `hidden`: a hidden box can still be scrolled by focus or
  // scrollIntoView, which slid the header off a phone and left the tools
  // over the garment. A clip never scrolls. Browsers without `clip` (iOS
  // Safari before 16) keep `hidden` rather than dropping to `visible`.
  const overflow = 'overflow-hidden supports-[overflow:clip]:overflow-clip'
  return drawInFlow
    ? `relative h-[calc(100dvh_-_var(--studio-top,0px))] ${overflow}`
    : `relative h-[calc(100dvh_-_var(--studio-top,0px))] min-h-[30rem] ${overflow}`
}

/** Solid, because the steps without a Draw pane run the 3D scene behind it. */
/**
 * The save indicator's box: one size whatever it says (third outside test
 * pass), so the header never grows or reflows when a save starts or ends.
 */
export function saveIndicatorClass() {
  return 'flex h-9 w-[11rem] max-w-full shrink-0 max-sm:w-auto items-center gap-1 overflow-hidden font-body text-xs'
}

/**
 * The studio bar (studio mode, 26 Nov). The site header is not shown in the
 * studio, so this is the only chrome above the work. At lg it is one row:
 * the way out, name and save state on the left, the steps in the middle,
 * history and the step's buttons on the right. The right keeps its natural
 * width, so Continue is never pushed off screen; the name gives way instead.
 * On a phone, two short rows.
 */
export function studioHeaderClass() {
  return 'pointer-events-auto flex shrink-0 flex-col gap-1 border-b border-flv-line bg-flv-paper px-2 pt-[max(0.25rem,env(safe-area-inset-top))] pb-1 lg:absolute lg:inset-x-0 lg:top-0 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] lg:items-center lg:gap-x-4 lg:gap-y-1 lg:px-3 lg:py-1.5'
}

/** The bar's left: the way out, the design's name and its save state. */
export function studioBarStartClass() {
  return 'flex min-w-0 items-center gap-2'
}

/** The steps and the step's buttons: a row of their own on a phone, the bar's middle and right at lg. */
export function studioBarEndClass() {
  return 'flex min-w-0 items-center gap-1 lg:contents'
}

/**
 * The steps without a Draw pane start the scene below the solid header, so it
 * never covers the garment, and stop short of the tool column so the garment
 * centres in the space left. Below lg the scene also stops above the tools
 * and publishing, so the whole tee shows over them. Any shape is safe for
 * publishing: `captureFov` fits the capture to the canvas's aspect.
 */
export function studioSceneClass() {
  return 'relative h-full min-h-80 w-full pt-[var(--studio-chrome-bottom,0px)] pb-[var(--studio-tools-height,0px)] lg:pr-[21rem] lg:pb-0'
}

/** Below lg only the scene shows here, between the header and the tools, as in `studioSceneClass`. */
export function dualStudioGridClass({ flatSides = true }: { flatSides?: boolean } = {}) {
  // With the flat sides folded away (wide screens), the garment takes the stage.
  const columns = flatSides ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]' : 'lg:grid-cols-1'
  return `grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(12rem,1fr)] pt-[var(--studio-chrome-bottom,0px)] pb-[var(--studio-tools-height,0px)] ${columns} lg:grid-rows-[minmax(20rem,1fr)] lg:gap-3 lg:pt-[calc(var(--studio-chrome-bottom,6rem)_+_0.25rem)] lg:pr-3 lg:pb-3 lg:pl-[21.25rem]`
}

/**
 * The one tool column at lg: tools scroll above, publishing sits below. Below
 * lg its children stay in the page's flow.
 */
export function studioToolColumnClass({
  side,
  singleScroll = false,
}: {
  side: 'left' | 'right'
  /**
   * Preview & Publish: the try-on cards and the publish panel scroll as one
   * column at lg. Two scrollers squeezed the try-on card to a sliver at
   * 900 px tall, and hid it once the publish confirmation opened.
   */
  singleScroll?: boolean
}) {
  return cn(
    'contents lg:pointer-events-auto lg:absolute lg:top-[calc(var(--studio-chrome-bottom,6rem)_+_0.25rem)] lg:bottom-3 lg:flex lg:w-80 lg:flex-col lg:gap-2',
    side === 'left' ? 'lg:left-3' : 'lg:right-3',
    { 'lg:overflow-y-auto lg:overscroll-contain': singleScroll },
  )
}

/** The camera views float over the bottom of the stage at lg, clear of the tool column. */
export function studioCameraBarClass() {
  return 'pointer-events-auto absolute bottom-4 left-[calc(50%_-_10.5rem)] -translate-x-1/2'
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

/**
 * Below lg, the stage between the header and the tools. Its floor keeps the
 * tee in view on short phones: the tools scroll in what is left.
 */
export function studioPhoneStageClass() {
  return 'relative min-h-48 flex-1 lg:hidden'
}

export function studioPhoneDrawClass() {
  return 'flex h-[min(70dvh,34rem)] min-h-72 shrink-0 flex-col px-3 pb-2'
}

export function studioPhoneToolsClass({
  drawInFlow = false,
  singleScroll = false,
}: { drawInFlow?: boolean; singleScroll?: boolean } = {}) {
  // With the Draw canvas in flow the whole column scrolls, so tools keep their height.
  if (drawInFlow) {
    return 'pointer-events-auto flex shrink-0 flex-col gap-2 px-3'
  }

  const base = 'pointer-events-auto flex max-h-[min(32vh,18rem)] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 lg:max-h-none lg:px-0'

  // In a single-scroll column (`studioToolColumnClass`) the tools keep their
  // own height and grow to fill a short column, so publishing stays at the bottom.
  return singleScroll ? `${base} lg:shrink-0 lg:grow lg:overflow-visible` : `${base} lg:flex-1`
}

/**
 * At lg the publish panel holds the bottom of the tool column, below the
 * tools' own scrolling area rather than over it, so it never hides focus.
 * Anchored there, the header settling or a hint going never moves the
 * button out from under a click in progress.
 */
export function studioPhonePublishClass({ singleScroll = false }: { singleScroll?: boolean } = {}) {
  const base = 'pointer-events-auto flex max-h-[min(34vh,24rem)] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-0 lg:pb-0 lg:empty:hidden'

  // In a single-scroll column it is pinned to the column's bottom while the
  // try-on cards scroll behind it: the button still never moves mid-click.
  return singleScroll
    ? `${base} lg:sticky lg:bottom-0 lg:z-10 lg:max-h-none lg:overflow-visible lg:bg-flv-paper lg:pt-2`
    : `${base} lg:max-h-[70%]`
}

export function railFrameClass() {
  return 'flv-panel flex w-full flex-col gap-3 p-3'
}

export function chromeKickerClass() {
  return 'font-body text-xs font-medium tracking-[0.08em] text-flv-accent uppercase'
}

export function chromeTextClass() {
  return 'font-body text-sm font-medium text-flv-ink'
}

export function chromeMutedClass() {
  return 'font-body text-xs text-flv-muted'
}

export function emptyStepClass() {
  return 'flv-panel flex flex-col gap-2 p-4'
}
