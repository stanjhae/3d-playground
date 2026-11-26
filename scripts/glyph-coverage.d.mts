export const FACE_SOURCES: Record<'display' | 'sans' | 'slab' | 'condensed' | 'script' | 'marker' | 'mono' | 'blackletter', string>
export function deriveGlyphCoverage(): Record<'display' | 'sans' | 'slab' | 'condensed' | 'script' | 'marker' | 'mono' | 'blackletter', Array<[number, number]>>
export function renderGlyphCoverage(coverage?: Record<string, Array<[number, number]>>): string
