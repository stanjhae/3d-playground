import { GRAPHIC_ROWS } from './graphics-catalogue.gen.ts'

/**
 * The editor's graphics library. The art lives in public/graphics and is
 * drawn by scripts/build-graphics.mjs, which also writes the catalogue rows
 * this module reads (graphics-catalogue.gen.ts). Ids are stable: saved
 * designs refer to graphics by `src`, and library-assets.ts by id.
 */

export const GRAPHIC_CATEGORIES = [
  { id: 'flames', label: 'Flames' },
  { id: 'crosses', label: 'Crosses' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'florals', label: 'Florals' },
  { id: 'ornaments', label: 'Type ornaments' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'logos', label: 'Logos' },
] as const

export type GraphicCategory = (typeof GRAPHIC_CATEGORIES)[number]['id']

/** One catalogue row: id, label, category, space-separated tags, then author and licence if not the default. */
export type GraphicRow = readonly [id: string, label: string, category: GraphicCategory, tags: string, author?: string, licence?: string]

export type GraphicAsset = {
  id: string
  label: string
  category: GraphicCategory
  src: string
  tags: readonly string[]
  author: string
  licence: string
}

export const GRAPHIC_DEFAULT_AUTHOR = 'Fashion Leader Vote studio'
export const GRAPHIC_DEFAULT_LICENCE = 'CC0-1.0'

export const GRAPHIC_ASSETS: readonly GraphicAsset[] = GRAPHIC_ROWS.map(
  ([id, label, category, tags, author = GRAPHIC_DEFAULT_AUTHOR, licence = GRAPHIC_DEFAULT_LICENCE]) => ({
    id,
    label,
    category,
    src: `/graphics/${id}.svg`,
    tags: tags.split(' ').filter(Boolean),
    author,
    licence,
  }),
)

const CATEGORY_LABEL = new Map<string, string>(GRAPHIC_CATEGORIES.map((category) => [category.id, category.label]))

function normalise(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SEARCH_TEXT = new Map(
  GRAPHIC_ASSETS.map((asset) => [
    asset.id,
    { label: normalise(asset.label), all: normalise(`${asset.label} ${asset.tags.join(' ')} ${CATEGORY_LABEL.get(asset.category) ?? ''}`) },
  ]),
)

/**
 * Graphics in `category` whose name, tags or category hold every word of
 * `query`. Words match from their start ("flam" finds flames). An exact
 * name comes first, then names that start with the query, then other name
 * matches, then tag matches.
 */
export function searchGraphics({
  query = '',
  category = 'all',
}: {
  query?: string
  category?: GraphicCategory | 'all'
}): GraphicAsset[] {
  const terms = normalise(query).split(' ').filter(Boolean)
  const inCategory = category === 'all' ? [...GRAPHIC_ASSETS] : GRAPHIC_ASSETS.filter((asset) => asset.category === category)

  if (terms.length === 0) {
    return inCategory
  }

  const phrase = terms.join(' ')
  const startsWord = (text: string, term: string) => ` ${text}`.includes(` ${term}`)
  const rankOf = (label: string) => {
    if (label === phrase) return 0
    if (label.startsWith(phrase)) return 1
    return terms.every((term) => startsWord(label, term)) ? 2 : 3
  }
  const ranked = inCategory.flatMap((asset) => {
    const text = SEARCH_TEXT.get(asset.id)!
    return terms.every((term) => startsWord(text.all, term)) ? [{ asset, rank: rankOf(text.label) }] : []
  })

  return ranked.sort((a, b) => a.rank - b.rank).map(({ asset }) => asset)
}

export function listGraphicsByCategory({ category }: { category: GraphicCategory | 'all' }): GraphicAsset[] {
  return searchGraphics({ category })
}
