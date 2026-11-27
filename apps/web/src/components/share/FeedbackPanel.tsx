import { useEffect, useState } from 'react'

import { buttonClass, chipClass } from '../ui/Button'
import {
  FEEDBACK_SIZES,
  FEEDBACK_SIZE_LABELS,
  FEEDBACK_TAGS,
  FEEDBACK_TAG_LABELS,
  FEEDBACK_NOTE_MAX,
  PRICE_BANDS,
  PRICE_BAND_LABELS,
  type FeedbackAnswer,
  type FeedbackSize,
  type FeedbackSummary,
  type FeedbackTag,
  type PriceBand,
} from '../../lib/flp-api/feedback'
import { getFeedback, putFeedback } from '../../lib/flp-api/feedback-client'

/**
 * One-tap answers after a vote, for the version that is live now. The
 * owner sees the totals for that version instead of a form.
 */
export function FeedbackPanel({ slug, voted, own }: { slug: string; voted: boolean; own: boolean }) {
  const [answer, setAnswer] = useState<FeedbackAnswer | null>(null)
  const [summary, setSummary] = useState<FeedbackSummary | null>(null)
  const [wouldWear, setWouldWear] = useState<boolean | null>(null)
  const [priceBand, setPriceBand] = useState<PriceBand | null>(null)
  const [size, setSize] = useState<FeedbackSize | null>(null)
  const [tags, setTags] = useState<FeedbackTag[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!voted && !own) {
      return
    }

    let cancelled = false

    void getFeedback({ slug }).then((result) => {
      if (cancelled || !result.ok) {
        return
      }

      if (result.data.role === 'owner') {
        setSummary(result.data.summary)
        return
      }

      const current = result.data.answer
      setAnswer(current)

      if (current) {
        setWouldWear(current.wouldWear)
        setPriceBand(current.priceBand)
        setSize(current.size)
        setTags(current.tags)
        setNote(current.note ?? '')
        setSaved(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [slug, voted, own])

  if (own) {
    if (!summary || summary.responses === 0) {
      return null
    }

    return (
      <section className="mt-3 flex max-w-sm flex-col gap-2 border-t border-flv-line pt-3" aria-label="Feedback on this version">
        <p className="font-body text-xs text-flv-muted">
          Version {summary.seq}: {summary.responses} {summary.responses === 1 ? 'response' : 'responses'}, {summary.wouldWear}{' '}
          would wear it.
        </p>
        <p className="font-body text-xs text-flv-ink">
          {PRICE_BANDS.filter((band) => summary.priceBands[band] > 0)
            .map((band) => `${PRICE_BAND_LABELS[band]} ${summary.priceBands[band]}`)
            .join(' · ')}
        </p>
      </section>
    )
  }

  if (!voted) {
    return null
  }

  function toggleTag({ tag }: { tag: FeedbackTag }) {
    setSaved(false)
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]))
  }

  async function save() {
    if (wouldWear === null || !priceBand || busy) {
      return
    }

    setBusy(true)
    setError(null)
    const result = await putFeedback({
      slug,
      answer: { wouldWear, priceBand, size, tags, note: note.trim() || null },
    })
    setBusy(false)

    if (result.ok && result.data.role === 'voter') {
      setAnswer(result.data.answer)
      setSaved(true)
      return
    }

    setError(result.ok ? 'Feedback could not be saved.' : result.message)
  }

  return (
    <section className="mt-3 flex max-w-sm flex-col gap-3 border-t border-flv-line pt-3" aria-label="Tell the designer more">
      <p className="font-body text-xs text-flv-muted">{saved && answer ? 'Your feedback is saved. Change it any time.' : 'A few taps. Optional.'}</p>
      <div className="flex flex-col gap-1">
        <p className="font-body text-xs text-flv-ink">Would you wear it?</p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={wouldWear === true}
            className={chipClass({ selected: wouldWear === true })}
            onClick={() => {
              setSaved(false)
              setWouldWear(true)
            }}
          >
            Yes
          </button>
          <button
            type="button"
            aria-pressed={wouldWear === false}
            className={chipClass({ selected: wouldWear === false })}
            onClick={() => {
              setSaved(false)
              setWouldWear(false)
            }}
          >
            No
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-body text-xs text-flv-ink">What would you pay?</p>
        <div className="flex flex-wrap gap-2">
          {PRICE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              aria-pressed={priceBand === band}
              className={chipClass({ selected: priceBand === band })}
              onClick={() => {
                setSaved(false)
                setPriceBand(band)
              }}
            >
              {PRICE_BAND_LABELS[band]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-body text-xs text-flv-ink">Your size, if you want</p>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_SIZES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={size === item}
              className={chipClass({ selected: size === item })}
              onClick={() => {
                setSaved(false)
                setSize(size === item ? null : item)
              }}
            >
              {FEEDBACK_SIZE_LABELS[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-body text-xs text-flv-ink">What stands out?</p>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              className={chipClass({ selected: tags.includes(tag) })}
              onClick={() => toggleTag({ tag })}
            >
              {FEEDBACK_TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 font-body text-xs text-flv-ink">
        Anything else
        <textarea
          value={note}
          maxLength={FEEDBACK_NOTE_MAX}
          rows={2}
          onChange={(event) => {
            setSaved(false)
            setNote(event.target.value)
          }}
          className="min-h-16 border border-flv-line bg-flv-paper px-3 py-2 text-sm text-flv-ink focus:border-flv-accent focus:outline-none"
        />
      </label>
      <button
        type="button"
        className={buttonClass({ variant: 'secondary' })}
        disabled={busy || wouldWear === null || !priceBand}
        onClick={() => void save()}
      >
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save feedback'}
      </button>
      <p role="status" className={error ? 'font-body text-xs text-flv-accent' : 'sr-only'}>
        {error ?? ''}
      </p>
    </section>
  )
}
