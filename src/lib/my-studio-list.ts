import type { DesignSummary } from './flp-api/client'

/** How My Studio orders its cards (P3). */
export const STUDIO_SORTS = [
  { id: 'recent', label: 'Recently edited' },
  { id: 'name', label: 'Name' },
] as const

export type StudioSort = (typeof STUDIO_SORTS)[number]['id']

const SORT_KEY = 'flp-studio-sort'
const TITLE_MAX = 80
const nameOrder = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function fold({ text }: { text: string }) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
}

/** Designs whose name has every word of the search, in the chosen order. */
export function visibleDesigns({
  designs,
  query,
  sort,
}: {
  designs: readonly DesignSummary[]
  query: string
  sort: StudioSort
}) {
  const words = fold({ text: query }).split(/\s+/).filter(Boolean)
  const matching = designs.filter((design) => {
    const title = fold({ text: design.title })
    return words.every((word) => title.includes(word))
  })

  return sort === 'name'
    ? [...matching].sort((a, b) => nameOrder.compare(a.title, b.title) || b.updatedAt.localeCompare(a.updatedAt))
    : [...matching].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** "Crest tee" → "Crest tee copy", kept inside the 80-character limit. */
export function copyTitle({ title }: { title: string }) {
  const suffix = ' copy'
  const base = title.trim() || 'Untitled tee'
  return `${base.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`
}

export function readStudioSort({ storage }: { storage: Pick<Storage, 'getItem'> | null }): StudioSort {
  try {
    const value = storage?.getItem(SORT_KEY)
    return STUDIO_SORTS.some((sort) => sort.id === value) ? (value as StudioSort) : 'recent'
  } catch {
    return 'recent'
  }
}

export function writeStudioSort({ storage, sort }: { storage: Pick<Storage, 'setItem'> | null; sort: StudioSort }) {
  try {
    storage?.setItem(SORT_KEY, sort)
  } catch {
    // The order just resets next time.
  }
}
