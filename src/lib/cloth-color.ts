import type { DesignDocument } from './design-document'
import { TEMPLATE_IDS, resolveTemplate } from './template-manifest'

/** The cloth of a garment with no template and no colour of its own. */
export const DEFAULT_CLOTH_COLOR = '#f3efe6'

/**
 * The colour of the bare cloth, as the 3D garment draws it (tester pass 3).
 * A design's garment colour (for stripes or a check, their ground) reaches
 * the 3D model as its `body` override; with none, the model shows its
 * template's own material colour. The flat panels paint their ink over this
 * same colour, so the 2D and the 3D always agree. They used to paint a
 * fixed cream, so a striped ground showed cream in 2D and its real colour
 * in 3D.
 */
export function clothColorOf({ document }: { document: Pick<DesignDocument, 'garmentId' | 'garmentVersion' | 'overrides'> }) {
  const body = document.overrides.findLast((override) => override.meshName === 'body' && override.color)

  if (body?.color) {
    return body.color
  }

  return templateMaterialColor({ garmentId: document.garmentId, garmentVersion: document.garmentVersion }) ?? DEFAULT_CLOTH_COLOR
}

/** The material colour of the template a render document was projected from. */
function templateMaterialColor({ garmentId, garmentVersion }: { garmentId: string; garmentVersion: number }) {
  for (const id of TEMPLATE_IDS) {
    const resolved = resolveTemplate({ id, version: garmentVersion })

    if (resolved.ok && resolved.manifest.garmentId === garmentId) {
      return resolved.manifest.material.color
    }
  }

  return null
}

/** Dark and light ink for words, from the house palette. */
export const DARK_TEXT_INK = '#1a1c22'
export const LIGHT_TEXT_INK = '#f7f3ea'

/** WCAG relative luminance of a #rgb or #rrggbb colour; null if it is not one. */
export function relativeLuminance({ color }: { color: string }) {
  const hex = color.trim().replace(/^#/, '')
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex.slice(0, 6)

  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return null
  }

  const [r, g, b] = [0, 2, 4].map((start) => {
    const channel = Number.parseInt(full.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio({ a, b }: { a: number; b: number }) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * The ink a new word takes on this ground: dark on light cloth, light on
 * dark (UX review, 26 Nov). New words used to take the brush colour, so a
 * cream word over a cream stroke vanished where they crossed.
 */
export function contrastingTextInk({ ground }: { ground: string }) {
  const groundLuminance = relativeLuminance({ color: ground })

  if (groundLuminance === null) {
    return DARK_TEXT_INK
  }

  const dark = contrastRatio({ a: groundLuminance, b: relativeLuminance({ color: DARK_TEXT_INK }) ?? 0 })
  const light = contrastRatio({ a: groundLuminance, b: relativeLuminance({ color: LIGHT_TEXT_INK }) ?? 1 })
  return dark >= light ? DARK_TEXT_INK : LIGHT_TEXT_INK
}

/** The ink for a new word on this design: the one picked, or one that reads on its cloth. */
export function textInkFor({
  textColor,
  document,
}: {
  textColor: string | null
  document: Pick<DesignDocument, 'garmentId' | 'garmentVersion' | 'overrides'>
}) {
  return textColor ?? contrastingTextInk({ ground: clothColorOf({ document }) })
}
