import type { CanonicalTextFace } from './canonical-document'
import { GLYPH_COVERAGE } from './glyph-coverage.gen'

/**
 * Glyph coverage of the bundled text faces (#155). The table is generated
 * from the font files by scripts/glyph-coverage.mjs; a word is checked
 * against its face before it reaches the document, so a print never falls
 * back to whatever font the viewer's machine has.
 */

export const FACE_NAMES: Record<CanonicalTextFace, string> = {
  display: 'Display',
  sans: 'Sans',
}

export function faceCovers({ face, codePoint }: { face: CanonicalTextFace; codePoint: number }) {
  const ranges = GLYPH_COVERAGE[face]
  let low = 0
  let high = ranges.length / 2 - 1

  while (low <= high) {
    const mid = (low + high) >> 1

    if (codePoint < ranges[mid * 2]!) {
      high = mid - 1
    } else if (codePoint > ranges[mid * 2 + 1]!) {
      low = mid + 1
    } else {
      return true
    }
  }

  return false
}

let segmenter: Intl.Segmenter | null = null

function graphemes({ text }: { text: string }): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), (part) => part.segment)
}

/**
 * The characters (user-perceived, so "👍🏽" is one) `face` can't draw, each
 * once, in order. Text is compared composed (NFC), so a typed "e" plus
 * combining accent counts as "é".
 */
export function unsupportedCharacters({
  text,
  face,
}: {
  text: string
  face: CanonicalTextFace
}): string[] {
  const missing = new Set<string>()

  for (const character of graphemes({ text: text.normalize('NFC') })) {
    for (const symbol of character) {
      if (!faceCovers({ face, codePoint: symbol.codePointAt(0)! })) {
        missing.add(character)
        break
      }
    }
  }

  return [...missing]
}

function quoteList({ characters }: { characters: string[] }) {
  const quoted = characters.map((character) => `“${character}”`)
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}` : quoted[0]!
}

/** Why `face` can't take `text`, or null if every character is drawable. */
export function glyphMessage({ text, face }: { text: string; face: CanonicalTextFace }) {
  const characters = unsupportedCharacters({ text, face })

  if (characters.length === 0) {
    return null
  }

  const shown = characters.slice(0, 5)
  const more = characters.length - shown.length
  const other: CanonicalTextFace = face === 'display' ? 'sans' : 'display'
  const otherFits = unsupportedCharacters({ text, face: other }).length === 0
  const it = characters.length > 1 ? 'them' : 'it'

  return `The ${face} face can't draw ${quoteList({ characters: shown })}${more > 0 ? ` (and ${more} more)` : ''}. Remove ${it}${otherFits ? ` or switch to ${FACE_NAMES[other]}` : ''}.`
}
