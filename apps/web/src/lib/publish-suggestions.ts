import type { DesignDocument } from './design-document'
import { getFabricById } from './fabrics'
import { getGarment } from './garments'
import { INK_COLORS } from './paint-colors'

/**
 * What the guest publish step suggests from the design itself (UX review
 * 26 Nov, item 2): a default name from the chosen colour and cloth, and
 * tags from the colour, cloth, garment and the design's own words. The
 * name used to read "Cotton 01" whatever cloth was chosen, and the tags
 * were a fixed list unrelated to the design.
 */
export type PublishFacts = {
  garmentId: string
  /** The cloth's fabric id (the document's base fabric on a canonical garment). */
  fabricId: string | null | undefined
  /** The garment's base colour override, if any. */
  bodyColor: string | null | undefined
  layers: Pick<DesignDocument, 'layers'>['layers']
}

const MAX_SUGGESTED_TAGS = 6
const MAX_WORD_TAGS = 3

function colorName({ color }: { color: string | null | undefined }) {
  if (!color) {
    return null
  }

  return INK_COLORS.find((ink) => ink.value.toLowerCase() === color.toLowerCase())?.name ?? null
}

function fabricName({ fabricId }: { fabricId: string | null | undefined }) {
  return fabricId ? (getFabricById({ id: fabricId })?.name ?? null) : null
}

/** "Ivory Linen", "Night T-shirt", "T-shirt": the name before the serial. */
export function publishTitleLead({ facts }: { facts: PublishFacts }) {
  const fabric = fabricName({ fabricId: facts.fabricId })

  return [colorName({ color: facts.bodyColor }), fabric ?? getGarment({ garmentId: facts.garmentId }).label]
    .filter(Boolean)
    .join(' ')
}

/** Words from the design's visible text layers, each 3–20 letters. */
function designWords({ layers }: { layers: PublishFacts['layers'] }) {
  return layers
    .flatMap((layer) => (layer.kind === 'text' && layer.visible ? layer.content.split(/[^\p{L}\p{N}]+/u) : []))
    .filter((word) => word.length >= 3 && word.length <= 20)
}

export function suggestedPublishTags({ facts }: { facts: PublishFacts }) {
  const tags: string[] = []
  const add = (candidate: string | null) => {
    const tag = candidate?.trim().toLowerCase()

    if (!tag || tags.includes(tag)) {
      return false
    }

    tags.push(tag)
    return true
  }

  add(colorName({ color: facts.bodyColor }))
  add(fabricName({ fabricId: facts.fabricId }))
  add(getGarment({ garmentId: facts.garmentId }).label)

  let words = 0

  for (const word of designWords({ layers: facts.layers })) {
    if (words >= MAX_WORD_TAGS || tags.length >= MAX_SUGGESTED_TAGS) {
      break
    }

    if (add(word)) {
      words += 1
    }
  }

  return tags
}
