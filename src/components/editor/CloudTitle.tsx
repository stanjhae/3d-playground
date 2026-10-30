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
    </div>
  )
}
