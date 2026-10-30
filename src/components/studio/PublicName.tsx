import { useEffect, useState } from 'react'

import { getProfile, setDisplayName } from '../../lib/flp-api/client'

/**
 * The name this account shows on published designs (A06 #150). Optional;
 * a published design without one shows no name. The publish panel
 * pre-fills from it.
 */
export function PublicName() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void getProfile().then((result) => {
      if (!cancelled && result.ok) {
        setSaved(result.data.displayName)
        setDraft(result.data.displayName ?? '')
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (saved === undefined) {
    return null
  }

  const changed = draft.trim() !== (saved ?? '')

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        setStatus('Saving…')
        const result = await setDisplayName({ displayName: draft.trim() || null })

        if (result.ok) {
          setSaved(result.data.displayName)
          setDraft(result.data.displayName ?? '')
          setStatus(result.data.displayName ? 'Saved' : 'Cleared: published designs show no name')
        } else if (result.code !== 'account-changed') {
          setStatus(`Not saved (${result.message})`)
        }
      }}
    >
      <label className="flex flex-col gap-1 font-body text-xs text-flv-muted">
        Public name, shown on designs you publish
        <input
          className="min-h-9 w-56 border border-flv-line bg-transparent px-2 font-body text-sm text-flv-ink"
          value={draft}
          maxLength={40}
          placeholder="No name"
          onChange={(event) => {
            setDraft(event.target.value)
            setStatus(null)
          }}
        />
      </label>
      <button
        type="submit"
        disabled={!changed}
        className="inline-flex min-h-9 items-center border border-flv-line px-3 font-body text-[11px] tracking-[0.1em] uppercase hover:border-flv-accent hover:text-flv-accent disabled:opacity-50"
      >
        Save name
      </button>
      <span role="status" aria-live="polite" className="min-h-5 font-body text-xs text-flv-muted">
        {status}
      </span>
    </form>
  )
}
