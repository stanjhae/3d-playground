import { describe, expect, test } from 'vitest'

import {
  isCreateLandingStage,
  landingStageChip,
  landingStageTitle,
  LANDING_STAGE_IDS,
} from './landing-stages'

describe('landing-stages', () => {
  test('lists shipped stages plus vote', () => {
    expect(LANDING_STAGE_IDS).toEqual([
      'select',
      'fit',
      'color',
      'design',
      'preview',
      'share',
      'vote',
    ])
  })

  test('create stages deep-link; vote does not', () => {
    expect(isCreateLandingStage('design')).toBe(true)
    expect(isCreateLandingStage('vote')).toBe(false)
    expect(landingStageTitle({ stage: 'select' }).length).toBeGreaterThan(0)
  })

  test('chip labels stay short and readable', () => {
    expect(landingStageChip({ stage: 'color' })).toBe('Color')
    expect(landingStageChip({ stage: 'preview' })).toBe('Preview')
    expect(landingStageChip({ stage: 'share' })).toBe('Share')
  })
})
