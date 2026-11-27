import type { CanonicalDocument } from '../canonical-document.ts'
import type { CanonicalPattern } from './pattern-document.ts'
import { applyPatternOps } from './pattern-ops.ts'
import { shapeToOps } from './shape-to-pattern.ts'
import { patternTemplateFor } from './templates.ts'

/**
 * The pattern a design starts Pattern mode with: its template's, with the
 * design's shape sliders folded in so the garment keeps its look. Null when
 * the template has no pattern. Loaded on demand, so the families stay out
 * of the main bundle.
 */
export function startPattern({ document }: { document: CanonicalDocument }): CanonicalPattern | null {
  const template = patternTemplateFor({ templateId: document.template.id, templateVersion: document.template.version })

  if (!template) {
    return null
  }

  if (!document.shape) {
    return template.pattern
  }

  const folded = applyPatternOps({ pattern: template.pattern, ops: shapeToOps({ shape: document.shape, pattern: template.pattern }), frames: template.frames })
  return folded.ok ? folded.pattern : template.pattern
}
