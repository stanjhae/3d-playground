export const FACE_SOURCES: Record<'display' | 'sans', string>
export function deriveGlyphCoverage(): Record<'display' | 'sans', Array<[number, number]>>
export function renderGlyphCoverage(coverage?: Record<string, Array<[number, number]>>): string
