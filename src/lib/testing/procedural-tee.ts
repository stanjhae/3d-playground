/**
 * Import first in a test file whose suite measures the procedural tee
 * (its 512 atlas, rectangles and @3 proportions): new tee designs, and the
 * editor engine built when the store loads, then pin `@3` instead of the
 * real T-shirt (`@4`).
 */
import { pinCurrentTemplateForTests } from '../template-manifest.ts'

pinCurrentTemplateForTests({ templateId: 'tee-crew-short', version: 3 })
