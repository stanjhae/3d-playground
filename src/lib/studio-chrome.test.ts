import { describe, expect, test } from 'vitest'

import {
  CLOTH_LIST_ID,
  clothListVisibilityClass,
  clothSheetHeightClass,
  coverHeaderSpacerClass,
  lookSheetBodyClass,
  lookSheetFrameClass,
  nextClothOpen,
  studioPhonePublishClass,
  studioPhoneToolsClass,
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

describe('coverHeaderSpacerClass', () => {
  test('includes the header padding when there is no notch', () => {
    expect(coverHeaderSpacerClass()).toContain(
      'max(0.75rem,env(safe-area-inset-top))',
    )
  })
})

describe('look sheet chrome', () => {
  test('lets the canvas receive events outside the copy', () => {
    expect(lookSheetFrameClass()).toContain('pointer-events-none')
    expect(lookSheetFrameClass()).not.toContain('overflow-y-auto')
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
  test('lets tools scroll without pinning publish', () => {
    expect(studioPhoneToolsClass()).toContain('max-h-[min(32vh,18rem)]')
    expect(studioPhoneToolsClass()).toContain('overflow-y-auto')
    expect(studioPhoneToolsClass()).toContain('lg:right-6')
    expect(studioPhoneToolsClass()).toContain('lg:bottom-40')
  })

  test('pins publish on the cloth side at a readable scrollable width', () => {
    expect(studioPhonePublishClass()).toContain('shrink-0')
    expect(studioPhonePublishClass()).toContain('lg:right-6')
    expect(studioPhonePublishClass()).toContain('lg:w-80')
    expect(studioPhonePublishClass()).toContain('overflow-y-auto')
    expect(studioPhonePublishClass()).toContain('max-h-[min(72vh,42rem)]')
    expect(studioPhonePublishClass()).not.toContain('lg:left-6')
    expect(studioPhonePublishClass()).not.toContain('calc(50%')
  })
})
