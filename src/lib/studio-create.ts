import {
  type CanonicalDocument,
  createEmptyCanonicalDocument,
} from './canonical-document.ts'
import type { LandingHandoff } from './landing-handoff.ts'
import { type ImportNote, convertLegacyDesign, toColor } from './legacy-import.ts'

/**
 * First content for a new cloud design (A05 #149): the design carried over
 * from the landing page when there is one, otherwise an empty tee. Landing
 * neck/hem/sleeve choices land on the fixed template and are reported.
 */
export function initialStudioDocument({
  handoff,
}: {
  handoff: LandingHandoff | null
}): { document: CanonicalDocument; notes: ImportNote[]; fromLanding: boolean } {
  if (!handoff || handoff.garmentId !== 'tee') {
    return { document: createEmptyCanonicalDocument(), notes: [], fromLanding: false }
  }

  const converted = convertLegacyDesign({
    value: {
      ...handoff.document,
      garmentId: 'tee',
      structural: {
        ...(handoff.neck ? { neck: handoff.neck } : {}),
        ...(handoff.hem ? { hem: handoff.hem } : {}),
        ...(handoff.sleeve ? { sleeve: handoff.sleeve } : {}),
      },
    },
  })

  if (!converted.ok) {
    return {
      document: createEmptyCanonicalDocument(),
      notes: [{ path: '$', message: converted.message }],
      fromLanding: false,
    }
  }

  const document = converted.document
  const color = handoff.color ? toColor({ value: handoff.color }) : null

  if (color && document.base.kind === 'solid') {
    document.base = { kind: 'solid', color }
  }

  return {
    document,
    notes: [...converted.warnings, ...converted.unsupported],
    fromLanding: true,
  }
}
