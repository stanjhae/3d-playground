/**
 * Import first in a test file whose suite measures the procedural tee
 * (its 512 atlas, rectangles and @3 proportions): new tee designs, and the
 * editor engine built when the store loads, then pin `@3` instead of the
 * real T-shirt (`@4`).
 *
 * Vitest runs a test file's imports in order, so mocking the manifest here
 * applies to every module the file imports after this one. Production code
 * has no hook for it: there, new designs always pin a template's highest
 * version.
 */
import { vi } from 'vitest'

import type * as Manifest from '../template-manifest.ts'

vi.doMock('../template-manifest.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Manifest>()
  const resolved = actual.resolveTemplate({ id: 'tee-crew-short', version: 3 })

  if (!resolved.ok) {
    throw new Error('No tee-crew-short@3 to pin')
  }

  const procedural = resolved.manifest
  const isTee = (id: string) => id === procedural.id || id === procedural.garmentId

  return {
    ...actual,
    currentTemplateFor: ({ templateId }: { templateId: string }) =>
      isTee(templateId) ? procedural : actual.currentTemplateFor({ templateId }),
    templateForGarment: ({ garmentId }: { garmentId: string }) =>
      isTee(garmentId) ? procedural : actual.templateForGarment({ garmentId }),
  }
})
