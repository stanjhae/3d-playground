import { useState } from 'react'

import { askForEdits, prepareSketch } from '../../lib/ai-assist'
import { cn } from '../../lib/cn'
import { getCanonicalDocument } from '../../lib/editor-store'
import { applyPatternOps } from '../../lib/pattern/pattern-ops'
import type { CanonicalPattern } from '../../lib/pattern/pattern-document'
import { chromeKickerClass, chromeMutedClass, chromeTextClass } from '../../lib/studio-chrome'

/**
 * "AI suggestion (beta)": a sketch or a description in, a previewed set
 * of pattern edits out. Nothing is applied until "Apply", and then through
 * the editor's own checks, as one undo step.
 */
export default function AiAssist({
  pattern,
  onPreview,
  onApply,
}: {
  pattern: CanonicalPattern
  onPreview: (pattern: CanonicalPattern | null) => void
  onApply: (pattern: CanonicalPattern, what: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [sketch, setSketch] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<{ pattern: CanonicalPattern; notes: string } | null>(null)

  const reset = () => {
    setSuggestion(null)
    onPreview(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent', chromeTextClass())}
      >
        AI suggestion (beta)
      </button>
    )
  }

  return (
    <section className="flex flex-col gap-2 border border-flv-line p-3" aria-label="AI suggestion" data-testid="ai-assist">
      <p className={chromeKickerClass()}>AI suggestion (beta)</p>
      <p className={chromeMutedClass()}>
        Add a sketch or describe the garment. Claude suggests changes to these pieces; you see them before anything is applied. Sketches and words are sent to Anthropic and not kept.
      </p>
      <label className={cn('flex flex-col gap-1', chromeTextClass())}>
        Sketch (optional)
        <input type="file" accept="image/png,image/jpeg" onChange={(event) => setSketch(event.target.files?.[0] ?? null)} />
      </label>
      <label className={cn('flex flex-col gap-1', chromeTextClass())}>
        Describe it (optional)
        <textarea
          value={prompt}
          maxLength={500}
          rows={3}
          onChange={(event) => setPrompt(event.target.value)}
          className="border border-flv-line p-2"
          placeholder="A cropped tee with one long sleeve and a curved hem"
        />
      </label>

      {suggestion ? (
        <div className="flex flex-col gap-2" role="status">
          <p className={chromeTextClass()}>{suggestion.notes || 'Here’s a suggestion.'}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onApply(suggestion.pattern, 'Applied the AI suggestion')
                setSuggestion(null)
                setOpen(false)
              }}
              className="flv-cta min-h-11 px-4 font-body text-sm font-medium"
            >
              Apply
            </button>
            <button type="button" onClick={reset} className={cn('min-h-11 border border-flv-line px-3', chromeTextClass())}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || (!prompt.trim() && !sketch)}
            onClick={async () => {
              setBusy(true)
              setMessage(null)

              try {
                const image = sketch ? await prepareSketch(sketch) : null
                const answer = await askForEdits({ template: getCanonicalDocument().template, prompt: prompt.trim(), image })

                if (!answer.ok) {
                  setMessage(answer.message)
                  return
                }

                if (answer.data.ops.length === 0) {
                  setMessage(answer.data.notes || 'No changes suggested. Try a clearer sketch or more words.')
                  return
                }

                const result = applyPatternOps({ pattern, ops: answer.data.ops })

                if (!result.ok) {
                  setMessage('The suggestion couldn’t be sewn on this pattern. Try again, or edit by hand.')
                  return
                }

                setSuggestion({ pattern: result.pattern, notes: answer.data.notes })
                onPreview(result.pattern)
              } catch {
                setMessage('That sketch couldn’t be read. Try a PNG or JPEG.')
              } finally {
                setBusy(false)
              }
            }}
            className="flv-cta min-h-11 px-4 font-body text-sm font-medium disabled:opacity-40"
          >
            {busy ? 'Thinking…' : 'Suggest'}
          </button>
          <button
            type="button"
            onClick={() => {
              reset()
              setOpen(false)
            }}
            className={cn('min-h-11 border border-flv-line px-3', chromeTextClass())}
          >
            Close
          </button>
        </div>
      )}

      {message ? (
        <p role="alert" className={cn('text-flv-accent', chromeTextClass())}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
