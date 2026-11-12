/**
 * Scrolls only the nearest scrolling column so `element` shows, never the
 * page or the studio's clipped frames. `scrollIntoView` also moves
 * `overflow: hidden` ancestors, which on a phone slid the whole studio out
 * from under its own header.
 */
export function revealInScroller({ element }: { element: HTMLElement }) {
  let scroller = element.parentElement

  while (scroller) {
    const overflowY = getComputedStyle(scroller).overflowY

    if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight) {
      break
    }

    scroller = scroller.parentElement
  }

  if (!scroller || scroller === document.scrollingElement || scroller === document.body) {
    return
  }

  const box = element.getBoundingClientRect()
  const frame = scroller.getBoundingClientRect()

  if (box.top < frame.top) {
    scroller.scrollTop -= frame.top - box.top
  } else if (box.bottom > frame.bottom) {
    scroller.scrollTop += Math.min(box.bottom - frame.bottom, box.top - frame.top)
  }
}
