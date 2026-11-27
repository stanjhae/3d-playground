import { describe, expect, test } from 'vitest'

import { garmentPanels } from '../../lib/garments'
import { CAMERA_BAR_PRESETS } from './CameraPresetBar'

describe('the camera bar', () => {
  test('each sleeve view has the same wearer-side name as its panel', () => {
    for (const panel of garmentPanels({ garmentId: 'tee' }).filter(({ id }) => id === 'left' || id === 'right')) {
      expect(CAMERA_BAR_PRESETS.find(({ id }) => id === panel.id)?.label).toBe(panel.label)
    }
  })
})
