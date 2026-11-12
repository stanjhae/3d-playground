import { describe, expect, test } from 'vitest'

import {
  CLOTH_LIST_ID,
  clothListVisibilityClass,
  clothSheetHeightClass,
  dualStudioGridClass,
  lookSheetBodyClass,
  lookSheetFrameClass,
  nextClothOpen,
  studioPhonePublishClass,
  studioPhoneStageClass,
  studioPhoneToolsClass,
  studioSceneClass,
  studioSectionClass,
} from './studio-chrome'

describe('nextClothOpen', () => {
  test('toggles the sheet', () => {
    expect(
      nextClothOpen({ clothOpen: false, action: 'toggle' }),
    ).toBe(true)
    expect(
      nextClothOpen({ clothOpen: true, action: 'toggle' }),
    ).toBe(false)
  })

  test('keeps the sheet open after a fabric or part change', () => {
    expect(
      nextClothOpen({ clothOpen: true, action: 'apply-fabric' }),
    ).toBe(true)
    expect(
      nextClothOpen({ clothOpen: true, action: 'select-part' }),
    ).toBe(true)
    expect(
      nextClothOpen({ clothOpen: false, action: 'apply-fabric' }),
    ).toBe(false)
  })
})

describe('clothListVisibilityClass', () => {
  test('hides the list while the sheet is closed', () => {
    expect(clothListVisibilityClass({ clothOpen: false })).toEqual({
      hidden: true,
      flex: false,
    })
  })

  test('shows the list while the sheet is open', () => {
    expect(clothListVisibilityClass({ clothOpen: true })).toEqual({
      hidden: false,
      flex: true,
    })
  })
})

describe('clothSheetHeightClass', () => {
  test('keeps an open cloth list shorter than the tool scroll', () => {
    expect(clothSheetHeightClass({ clothOpen: true })).toEqual({
      'max-h-[min(28vh,16rem)] overflow-hidden': true,
    })
    expect(clothSheetHeightClass({ clothOpen: false })).toEqual({
      'max-h-[min(28vh,16rem)] overflow-hidden': false,
    })
  })
})

describe('look sheet chrome', () => {
  test('lets the canvas receive events outside the copy', () => {
    expect(lookSheetFrameClass()).toContain('pointer-events-none')
    expect(lookSheetFrameClass()).not.toContain('overflow-y-auto')
    expect(lookSheetFrameClass()).toContain('from-flv-paper')
  })

  test('makes the copy the scroll surface', () => {
    expect(lookSheetBodyClass()).toContain('pointer-events-auto')
    expect(lookSheetBodyClass()).toContain('overflow-y-auto')
  })

  test('keeps the home-indicator inset at the sm breakpoint', () => {
    expect(lookSheetFrameClass()).toContain(
      'sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]',
    )
    expect(lookSheetFrameClass()).not.toContain('sm:pb-6')
    expect(lookSheetFrameClass()).not.toContain('sm:p-6')
  })

  test('keeps a sheet cap on tablets', () => {
    expect(lookSheetFrameClass()).toContain('max-h-[min(58vh,28rem)]')
    expect(lookSheetFrameClass()).not.toContain('sm:max-h-none')
  })

  test('keeps a stable id for the cloth list', () => {
    expect(CLOTH_LIST_ID).toBe('cloth-list')
  })
})

describe('studio phone chrome', () => {
  test('stops the scene above the tools below lg, and not at lg', () => {
    expect(studioSceneClass()).toContain('pb-[var(--studio-tools-height,0px)]')
    expect(studioSceneClass()).toContain('lg:pb-0')
    expect(studioPhoneStageClass()).toContain('min-h-48')
    expect(studioPhoneStageClass()).toContain('lg:hidden')
    expect(dualStudioGridClass()).toContain('pb-[var(--studio-tools-height,0px)]')
    expect(dualStudioGridClass()).toContain('lg:pb-3')
  })

  test('lets tools scroll without pinning publish', () => {
    expect(studioPhoneToolsClass()).toContain('max-h-[min(32vh,18rem)]')
    expect(studioPhoneToolsClass()).toContain('overflow-y-auto')
    expect(studioPhoneToolsClass()).toContain('lg:max-h-none')
  })

  test('keeps publish at the bottom of the tool column, below the tools rather than over them', () => {
    expect(studioPhonePublishClass()).toContain('shrink-0')
    expect(studioPhonePublishClass()).toContain('lg:max-h-[70%]')
    expect(studioPhonePublishClass()).not.toContain('sticky')
    expect(studioPhonePublishClass()).toContain('overflow-y-auto')
    // A third of the phone at most, so the garment keeps its share while publishing.
    expect(studioPhonePublishClass()).toContain('max-h-[min(34vh,24rem)]')
    expect(studioPhonePublishClass()).not.toContain('lg:left-6')
    expect(studioPhonePublishClass()).not.toContain('calc(50%')
  })
})

describe('studioSectionClass (#163)', () => {
  test('drops the min height when the Draw overlay scrolls on its own', () => {
    expect(studioSectionClass()).toContain('min-h-[30rem]')
    expect(studioSectionClass({ drawInFlow: true })).not.toContain('min-h-')
  })

  test('clips rather than hides where it can, so focus can never scroll the header away', () => {
    for (const drawInFlow of [false, true]) {
      const classes = studioSectionClass({ drawInFlow }).split(' ')
      expect(classes).toContain('supports-[overflow:clip]:overflow-clip')
      // Older Safari has no `clip`: it must still hide, never overflow.
      expect(classes).toContain('overflow-hidden')
    }
  })
})
