import { useState } from 'react'

import { useEditorStore } from '../../lib/editor-store'
import { updateDesign } from '../../lib/flp-api/client'

/**
 * The open cloud design's name, renamable in place (A06 #150). A rename is
 * design metadata: it adds no version and does not touch the canvas.
 */
export function CloudTitle() {
  const cloud = useEditorStore((state) => state.cloud)
  const setCloudTitle = useEditorStore((state) => state.setCloudTitle)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!cloud) {
    return null
  }

  const designId = cloud.designId
  const current = cloud.title

  async function commit(value: string) {
    const next = value.trim()
    setDraft(null)

    if (!next || next === current) {
      return
    }

    setCloudTitle({ title: next })
    const result = await updateDesign({ designId, request: { title: next } })

    if (!result.ok && result.code !== 'account-changed') {
      setCloudTitle({ title: current })
      setError(`Not renamed (${result.message}).`)
    } else {
      setError(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only" htmlFor="cloud-title">
        Design name
      </label>
      <input
        id="cloud-title"
        className="min-h-9 w-full max-w-xs border border-transparent bg-transparent px-1 font-display text-lg hover:border-flv-line focus:border-flv-accent"
        value={draft ?? current}
        maxLength={80}
        onFocus={() => setDraft(current)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => void commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            setDraft(current)
            requestAnimationFrame(() => event.currentTarget?.blur())
          }
        }}
      />
      {error ? (
        <p role="alert" className="font-body text-xs text-flv-accent">
          {error}
        </p>
      ) : null}
      <CloudDescription />
    </div>
  )
}

const DESCRIPTION_LIMIT = 500

/** A note about the design, for its owner; metadata, like the name. */
function CloudDescription() {
  const cloud = useEditorStore((state) => state.cloud)
  const setCloudDescription = useEditorStore((state) => state.setCloudDescription)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!cloud) {
    return null
  }

  const { designId, description: current = '' } = cloud
  const value = draft ?? current

  async function commit() {
    const next = value.trim()
    setDraft(null)

    if (next === current) {
      return
    }

    setCloudDescription({ description: next })
    const result = await updateDesign({ designId, request: { description: next } })

    if (!result.ok && result.code !== 'account-changed') {
      setCloudDescription({ description: current })
      setError(`Description not saved (${result.message}).`)
    } else {
      setError(null)
    }
  }

  return (
    <div className="flex max-w-xs flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        className="min-h-6 w-fit px-1 text-left font-body text-xs text-flv-muted underline-offset-2 hover:text-flv-accent hover:underline"
        onClick={() => setOpen(!open)}
      >
        {current ? 'Description' : 'Add a description'}
      </button>
      {open ? (
        <>
          <label className="sr-only" htmlFor="cloud-description">
            Design description
          </label>
          <textarea
            id="cloud-description"
            rows={3}
            maxLength={DESCRIPTION_LIMIT}
            aria-describedby="cloud-description-count"
            className="w-full border border-flv-line bg-flv-paper px-2 py-1 font-body text-xs text-flv-ink"
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
          />
          <p id="cloud-description-count" className="font-body text-xs text-flv-muted">
            {value.length} of {DESCRIPTION_LIMIT}. Private to you, and saved when you click away.
          </p>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="font-body text-xs text-flv-accent">
          {error}
        </p>
      ) : null}
    </div>
  )
}
