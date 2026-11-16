import { useId, useState } from 'react'

import { reportDesignHref } from '../../lib/alpha-contact'
import { useSessionStore } from '../../lib/auth/session-store'
import { reportDesign } from '../../lib/flp-api/client'
import { REPORT_REASONS, type ReportReason } from '../../lib/flp-api/contract'

const REASON_LABEL: Record<ReportReason, string> = {
  copyright: 'It copies someone else’s work',
  offensive: 'It’s offensive or hateful',
  spam: 'It’s spam or advertising',
  other: 'Something else',
}

type Stage = 'closed' | 'open' | 'sending' | 'sent' | 'failed'

/**
 * "Report this design": signed in, a reason and an optional note sent to
 * the operators (docs/abuse.md); signed out, an email. If sending fails,
 * the email address still works.
 */
export function ReportDesign({ slug }: { slug: string }) {
  const status = useSessionStore((state) => state.status)
  const [stage, setStage] = useState<Stage>('closed')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const formId = useId()

  // Signed out (a rights holder may have no account), reporting is by email.
  if (status !== 'signed-in') {
    return (
      <a className="underline hover:text-flv-accent" href={reportDesignHref({ slug })}>
        Report this design
      </a>
    )
  }

  if (stage === 'closed') {
    return (
      <button type="button" className="underline hover:text-flv-accent" aria-expanded={false} aria-controls={formId} onClick={() => setStage('open')}>
        Report this design
      </button>
    )
  }

  if (stage === 'sent') {
    return (
      <p role="status" className="text-flv-ink">
        Thanks. An operator will look at this design.
      </p>
    )
  }

  return (
    <form
      id={formId}
      aria-label="Report this design"
      className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-flv-line bg-white p-3 text-flv-ink"
      onSubmit={async (event) => {
        event.preventDefault()

        if (!reason) {
          setMessage('Choose a reason')
          return
        }

        setStage('sending')
        setMessage(null)
        const result = await reportDesign({ slug, request: { reason, ...(note.trim() ? { note: note.trim() } : {}) } })

        if (result.ok) {
          setStage('sent')
        } else if (result.code !== 'account-changed') {
          setStage('failed')
          setMessage(result.message)
        }
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-body text-xs font-medium">Why are you reporting it?</legend>
        {REPORT_REASONS.map((id) => (
          <label key={id} className="flex min-h-9 items-center gap-2 font-body text-xs">
            <input type="radio" name={`${formId}-reason`} value={id} checked={reason === id} onChange={() => setReason(id)} />
            {REASON_LABEL[id]}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 font-body text-xs">
        Anything we should know? (optional)
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          className="rounded-lg border border-flv-line px-2 py-1 font-body text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={stage === 'sending'}
          className="inline-flex min-h-9 items-center rounded-full bg-flv-ink px-3 font-body text-xs font-medium text-white disabled:opacity-50"
        >
          {stage === 'sending' ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="min-h-9 px-2 font-body text-xs underline" onClick={() => setStage('closed')}>
          Cancel
        </button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 font-body text-xs text-flv-accent">
        {message}
        {stage === 'failed' ? (
          <>
            {' '}
            You can also{' '}
            <a className="underline" href={reportDesignHref({ slug })}>
              email us
            </a>
            .
          </>
        ) : null}
      </p>
    </form>
  )
}
