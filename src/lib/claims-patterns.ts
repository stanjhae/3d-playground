/**
 * Claims the alpha cannot back (R13, R14, docs/claims-audit.md). Shared by
 * the e2e read of every public page, the landing copy test and the landing
 * prerender, which refuses to write a page that makes one.
 */
export const FORBIDDEN_CLAIMS: ReadonlyArray<readonly [string, RegExp]> = [
  ['a measurement in cm', /\b\d+\s?cm\b/i],
  ['a garment size', /\b(XS|XL|size chart|true to size|fits like)\b/],
  ['a fabric weight', /\b\d+\s?(gsm|oz)\b/i],
  ['production readiness', /\b(production[- ]ready|tech pack|ready to manufacture)\b/i],
  ['traction', /\b\d[\d,.]*\+?\s?(k\s)?(users|designers|creators|members|votes|designs created)\b/i],
  ['an early access promise', /\b(get early access|\d+ months? free|free access)\b/i],
  // Spelled in two parts so the name itself stays out of the source (brand-name.test.ts).
  ['the old name', new RegExp(['Fashion', 'Leaderboard'].join(' '))],
  ['a shape the tee is not', /\boversized\b/i],
  ['voting as a future feature', /voting comes later/i],
  [
    'a sample creator',
    /Elise Moreau|Camille Wren|Hiro Tanaka|Noor Rahman|Jules Adler|Marta Klein|Iman Farouk|Ada Voss|Jules Hart/,
  ],
]

/** The first forbidden claim in `text`, or null. */
export function findForbiddenClaim({ text }: { text: string }) {
  for (const [what, pattern] of FORBIDDEN_CLAIMS) {
    const match = text.match(pattern)

    if (match) {
      return { what, match: match[0] }
    }
  }

  return null
}
