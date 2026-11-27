import { apiError, type ApiError } from './contract.ts'

export const PRICE_BANDS = ['under_25', '25_50', '50_100', 'over_100', 'skip'] as const
export const FEEDBACK_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const
export const FEEDBACK_TAGS = ['fit', 'colour', 'graphic', 'fabric'] as const

export type PriceBand = (typeof PRICE_BANDS)[number]
export type FeedbackSize = (typeof FEEDBACK_SIZES)[number]
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number]

export const PRICE_BAND_LABELS: Record<PriceBand, string> = {
  under_25: 'Under $25',
  '25_50': '$25–50',
  '50_100': '$50–100',
  over_100: 'Over $100',
  skip: 'Not buying',
}

export const FEEDBACK_SIZE_LABELS: Record<FeedbackSize, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
}

export const FEEDBACK_TAG_LABELS: Record<FeedbackTag, string> = {
  fit: 'Fit',
  colour: 'Colour',
  graphic: 'Graphic',
  fabric: 'Fabric',
}

export const FEEDBACK_NOTE_MAX = 280

/** What one person says about one published version. */
export type FeedbackAnswer = {
  wouldWear: boolean
  priceBand: PriceBand
  size: FeedbackSize | null
  tags: FeedbackTag[]
  note: string | null
}

/** Totals for one published version. Groups smaller than one are just absent. */
export type FeedbackSummary = {
  seq: number
  responses: number
  wouldWear: number
  priceBands: Record<PriceBand, number>
  sizes: Record<FeedbackSize, number>
  tags: Record<FeedbackTag, number>
}

export type FeedbackView =
  | { role: 'voter'; seq: number; answer: FeedbackAnswer | null }
  | { role: 'owner'; summary: FeedbackSummary }

type Parsed = { ok: true; answer: FeedbackAnswer } | { ok: false; error: ApiError }

function isBand(value: unknown): value is PriceBand {
  return typeof value === 'string' && (PRICE_BANDS as readonly string[]).includes(value)
}

function isSize(value: unknown): value is FeedbackSize {
  return typeof value === 'string' && (FEEDBACK_SIZES as readonly string[]).includes(value)
}

function isTag(value: unknown): value is FeedbackTag {
  return typeof value === 'string' && (FEEDBACK_TAGS as readonly string[]).includes(value)
}

/** The body of POST /public/:slug/feedback. Unknown fields are ignored. */
export function parseFeedbackAnswer({ value }: { value: unknown }): Parsed {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: apiError({ code: 'invalid', message: 'Feedback must be an object' }) }
  }

  const record = value as Record<string, unknown>

  if (typeof record.wouldWear !== 'boolean') {
    return { ok: false, error: apiError({ code: 'invalid', message: 'Say whether you would wear it' }) }
  }

  if (!isBand(record.priceBand)) {
    return { ok: false, error: apiError({ code: 'invalid', message: 'Choose a price' }) }
  }

  let size: FeedbackSize | null = null

  if (record.size != null) {
    if (!isSize(record.size)) {
      return { ok: false, error: apiError({ code: 'invalid', message: 'Choose a size from the list' }) }
    }

    size = record.size
  }

  const rawTags = record.tags ?? []

  if (!Array.isArray(rawTags) || rawTags.length > FEEDBACK_TAGS.length || rawTags.some((tag) => !isTag(tag))) {
    return { ok: false, error: apiError({ code: 'invalid', message: 'Choose tags from the list' }) }
  }

  const tags = [...new Set(rawTags)]

  let note: string | null = null

  if (record.note != null) {
    if (typeof record.note !== 'string') {
      return { ok: false, error: apiError({ code: 'invalid', message: 'The note must be text' }) }
    }

    const trimmed = record.note.trim()

    if (trimmed.length > FEEDBACK_NOTE_MAX) {
      return { ok: false, error: apiError({ code: 'invalid', message: `Keep the note under ${FEEDBACK_NOTE_MAX} characters` }) }
    }

    note = trimmed.length > 0 ? trimmed : null
  }

  return { ok: true, answer: { wouldWear: record.wouldWear, priceBand: record.priceBand, size, tags, note } }
}

function emptySummary({ seq }: { seq: number }): FeedbackSummary {
  return {
    seq,
    responses: 0,
    wouldWear: 0,
    priceBands: { under_25: 0, '25_50': 0, '50_100': 0, over_100: 0, skip: 0 },
    sizes: { xs: 0, s: 0, m: 0, l: 0, xl: 0 },
    tags: { fit: 0, colour: 0, graphic: 0, fabric: 0 },
  }
}

/** Counts for one version. The caller has already limited the rows to that version. */
export function summarizeFeedback({ seq, answers }: { seq: number; answers: readonly FeedbackAnswer[] }): FeedbackSummary {
  const summary = emptySummary({ seq })
  summary.responses = answers.length

  for (const answer of answers) {
    if (answer.wouldWear) {
      summary.wouldWear += 1
    }

    summary.priceBands[answer.priceBand] += 1

    if (answer.size) {
      summary.sizes[answer.size] += 1
    }

    for (const tag of answer.tags) {
      summary.tags[tag] += 1
    }
  }

  return summary
}

/** A stored row, after the database has already checked the columns. */
export function storedFeedbackAnswer({
  row,
}: {
  row: { wouldWear: boolean; priceBand: string; size: string | null; tags: readonly string[] | null; note: string | null }
}): FeedbackAnswer | null {
  const parsed = parseFeedbackAnswer({
    value: { wouldWear: row.wouldWear, priceBand: row.priceBand, size: row.size, tags: row.tags ?? [], note: row.note },
  })

  return parsed.ok ? parsed.answer : null
}
