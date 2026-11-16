import { Link } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'

import { isHandle } from '../../lib/flp-api/contract'
import { getProfile, setPublicProfile } from '../../lib/flp-api/client'
import { failureSentence } from '../../lib/flp-api/plain-messages'

type Saved = { handle: string | null; profilePublic: boolean }

/**
 * The account's public profile page (`/u/:handle`): a handle, and whether
 * everyone can see the page. Off until the person turns it on; while off,
 * the page doesn't exist and the board shows no link to it.
 */
export function PublicProfile() {
  const [saved, setSaved] = useState<Saved | undefined>(undefined)
  const [handle, setHandle] = useState('')
  const [shown, setShown] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const hintId = useId()

  useEffect(() => {
    let cancelled = false

    void getProfile().then((result) => {
      if (!cancelled && result.ok) {
        setSaved({ handle: result.data.handle, profilePublic: result.data.profilePublic })
        setHandle(result.data.handle ?? '')
        setShown(result.data.profilePublic)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (saved === undefined) {
    return null
  }

  const typed = handle.trim().toLowerCase()
  const valid = typed === '' || isHandle(typed)
  const changed = typed !== (saved.handle ?? '') || shown !== saved.profilePublic

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault()

        if (!valid) {
          setStatus('Use 3 to 24 letters, digits or single hyphens')
          return
        }

        if (shown && !typed) {
          setStatus('Choose a handle before showing your profile')
          return
        }

        setStatus('Saving…')
        const result = await setPublicProfile({ handle: typed || null, profilePublic: shown })

        if (result.ok) {
          setSaved({ handle: result.data.handle, profilePublic: result.data.profilePublic })
          setHandle(result.data.handle ?? '')
          setShown(result.data.profilePublic)
          setStatus(result.data.profilePublic ? 'Saved: your profile is public' : 'Saved: your profile is private')
        } else if (result.code !== 'account-changed') {
          setStatus(failureSentence({ lead: 'Not saved', reason: result.message }))
        }
      }}
    >
      <label className="flex flex-col gap-1 font-body text-xs text-flv-muted">
        Profile handle
        <span className="flex items-center gap-1">
          <span aria-hidden className="font-body text-sm text-flv-muted">
            @
          </span>
          <input
            className="min-h-9 w-44 rounded-lg border border-flv-line bg-white px-2 font-body text-sm text-flv-ink"
            value={handle}
            maxLength={24}
            placeholder="your-handle"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!valid}
            aria-describedby={hintId}
            onChange={(event) => {
              setHandle(event.target.value)
              setStatus(null)
            }}
          />
        </span>
      </label>
      <label className="flex min-h-9 items-center gap-2 font-body text-xs text-flv-ink">
        <input
          type="checkbox"
          className="size-4"
          checked={shown}
          onChange={(event) => {
            setShown(event.target.checked)
            setStatus(null)
          }}
        />
        Show my profile
      </label>
      <button
        type="submit"
        disabled={!changed}
        className="inline-flex min-h-9 items-center rounded-full border border-flv-line bg-white px-3 font-body text-xs font-medium hover:border-flv-ink disabled:opacity-50"
      >
        Save profile
      </button>
      {saved.profilePublic && saved.handle ? (
        <Link to="/u/$handle" params={{ handle: saved.handle }} className="min-h-9 content-center font-body text-xs underline">
          View profile
        </Link>
      ) : null}
      <span id={hintId} role="status" aria-live="polite" className="min-h-5 basis-full font-body text-xs text-flv-muted">
        {status ?? (valid ? 'Your published designs, listed on one page with their votes.' : 'Use 3 to 24 letters, digits or single hyphens')}
      </span>
    </form>
  )
}
