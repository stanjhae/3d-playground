import { useCallback, useEffect, useState } from 'react'

import { captureAngleStills } from '../../lib/capture-still'
import { useEditorStore } from '../../lib/editor-store'
import {
  getProfile,
  getPublication,
  publishDesign,
  unpublishDesign,
  uploadRenders,
} from '../../lib/flp-api/client'
import type { OwnerPublication, PublicRenderKind } from '../../lib/flp-api/publication'
import { useCloudSaveStore } from './CloudSave'
import { getStudioCanvas } from './PublishBar'

/**
 * Publish an owned cloud design (P03 #181). Only the exact saved version
 * can be published: the panel needs "Saved to cloud", captures that
 * version's three views, uploads them, then moves the public pointer.
 */

const KIND_BY_ANGLE: PublicRenderKind[] = ['view_front', 'view_three_quarter', 'view_back']

const buttonClass =
  'flv-cta inline-flex min-h-11 items-center justify-center px-5 font-body text-xs tracking-[0.1em] uppercase disabled:opacity-50'
const quietClass =
  'inline-flex min-h-11 items-center px-1 font-body text-xs tracking-[0.08em] text-flv-muted uppercase underline-offset-4 hover:text-flv-accent hover:underline disabled:opacity-50'

export function shareUrl({ slug }: { slug: string }) {
  return `${window.location.origin}/s/${slug}`
}

export function CloudPublish() {
  const cloud = useEditorStore((state) => state.cloud)
  const saveStatus = useCloudSaveStore((state) => state.state?.status ?? null)
  const [publication, setPublication] = useState<OwnerPublication | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'publishing' | 'unpublishing' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const designId = cloud?.designId ?? null
  const headSeq = cloud?.headSeq ?? null
  const saved = saveStatus === 'saved'

  const refresh = useCallback(async () => {
    if (!designId) {
      return
    }

    const result = await getPublication({ designId })

    if (result.ok) {
      setPublication(result.data.publication)
      // The name this design was last published under, else the account's
      // public name (A06 #150).
      const published = result.data.publication?.displayName
      const profile = published ? null : await getProfile()
      const fallback = profile?.ok ? profile.data.displayName : null
      setDisplayName((current) => current || published || fallback || '')
    }
  }, [designId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!cloud || !designId || !headSeq) {
    return null
  }

  const live = publication?.status === 'published'

  async function publish() {
    if (!designId || !headSeq || !saved) {
      return
    }

    setBusy('publishing')
    setMessage(null)
    const editor = useEditorStore.getState()
    const stills = await captureAngleStills({
      canvas: getStudioCanvas(),
      setCameraPreset: editor.setCameraPreset,
      setCapturingAngles: editor.setCapturingAngles,
      restorePreset: editor.cameraPreset,
    })

    if (stills.length !== KIND_BY_ANGLE.length) {
      setBusy(null)
      setMessage('The garment views could not be captured. Open the 3D view and try again.')
      return
    }

    // The views must belong to the version being published.
    if (useEditorStore.getState().cloud?.headSeq !== headSeq) {
      setBusy(null)
      setMessage('The design changed while publishing. Wait for Saved to cloud, then try again.')
      return
    }

    const uploaded = await uploadRenders({
      designId,
      seq: headSeq,
      renders: stills.map((still, index) => ({
        kind: KIND_BY_ANGLE[index]!,
        data: still.slice(still.indexOf(',') + 1),
      })),
    })

    if (!uploaded.ok) {
      setBusy(null)
      setMessage(`The views could not be saved (${uploaded.message}).`)
      return
    }

    const result = await publishDesign({
      designId,
      seq: headSeq,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    })

    setBusy(null)

    if (!result.ok) {
      setMessage(`Not published (${result.message}).`)
      return
    }

    setReviewing(false)
    await refresh()
  }

  async function unpublish() {
    if (!designId) {
      return
    }

    setBusy('unpublishing')
    setMessage(null)
    const result = await unpublishDesign({ designId })
    setBusy(null)

    if (!result.ok) {
      setMessage(`Still published (${result.message}).`)
      return
    }

    await refresh()
  }

  return (
    <section className="flv-panel flex w-full flex-col gap-3 p-3" aria-label="Publish">
      {live && publication ? (
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs tracking-[0.08em] text-flv-accent uppercase">
            Published v{publication.seq} · draft v{headSeq}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={shareUrl({ slug: publication.slug })}
              target="_blank"
              rel="noreferrer"
              className="font-body text-sm break-all text-flv-ink underline"
            >
              {shareUrl({ slug: publication.slug })}
            </a>
            <button
              type="button"
              className={quietClass}
              onClick={() => void navigator.clipboard?.writeText(shareUrl({ slug: publication.slug }))}
            >
              Copy link
            </button>
            <button
              type="button"
              className={quietClass}
              disabled={busy !== null}
              onClick={() => void unpublish()}
            >
              {busy === 'unpublishing' ? 'Unpublishing…' : 'Unpublish'}
            </button>
          </div>
        </div>
      ) : (
        <p className="font-body text-sm text-flv-muted">Private. Only you can see this design.</p>
      )}

      {reviewing ? (
        <div className="flex flex-col gap-3 border-t border-flv-line pt-3">
          <p className="font-body text-sm">
            Publishing version <strong>v{headSeq}</strong> of “{cloud.title}”. Anyone with the link can view it, and
            public images can be copied. Later edits stay private until you publish again.
          </p>
          <label className="flex flex-col gap-1 font-body text-sm">
            Public display name (optional)
            <input
              value={displayName}
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              className="min-h-11 border border-flv-line bg-flv-paper px-3 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!saved || busy !== null}
              onClick={() => void publish()}
            >
              {busy === 'publishing' ? 'Publishing…' : live ? `Publish v${headSeq}` : 'Confirm publish'}
            </button>
            <button type="button" className={quietClass} onClick={() => setReviewing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={buttonClass}
          disabled={!saved}
          onClick={() => setReviewing(true)}
        >
          {live ? (publication?.seq === headSeq ? 'Published' : 'Publish latest') : 'Publish…'}
        </button>
      )}

      <p role="status" aria-live="polite" className="min-h-5 font-body text-xs text-flv-accent">
        {!saved ? 'Publishing is available once the design shows Saved to cloud.' : message}
      </p>
    </section>
  )
}
