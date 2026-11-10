import { Globe, Lock } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { buttonClass } from '../ui/Button'
import { waitForCurrentAtlas } from '../../lib/atlas-status'
import { PUBLISHED_STILL_PRESETS, captureAngleStills } from '../../lib/capture-still'
import { cn } from '../../lib/cn'
import { useCopyStatus } from '../../lib/copy-text'
import { useEditorStore } from '../../lib/editor-store'
import { countUnavailableImages } from '../../lib/layer-images'
import {
  getProfile,
  getPublication,
  publishDesign,
  unpublishDesign,
  uploadRenders,
} from '../../lib/flp-api/client'
import { failureSentence } from '../../lib/flp-api/plain-messages'
import type { OwnerPublication, PublicRenderKind } from '../../lib/flp-api/publication'
import { publishBlockedReason, useWebglStore } from '../scene/webgl-status'
import { useCloudSaveStore } from './CloudSave'
import { getStudioCanvas } from './PublishBar'
import { trackAssumption } from '../../lib/assumption-events'

/**
 * Publish an owned cloud design (P03 #181). Only the exact saved version
 * can be published: the panel needs "Saved to cloud", captures that
 * version's five views (front, three-quarter, back and both sleeves),
 * uploads them, then moves the public pointer.
 */

/** One kind per `PUBLISHED_STILL_PRESETS` entry, in the same order. */
const KIND_BY_ANGLE: PublicRenderKind[] = ['view_front', 'view_three_quarter', 'view_back', 'view_left', 'view_right']

const primaryClass = buttonClass({ wide: true })
const quietClass = buttonClass({ variant: 'quiet' })

export function shareUrl({ slug }: { slug: string }) {
  return `${window.location.origin}/s/${slug}`
}

export function CloudPublish() {
  const cloud = useEditorStore((state) => state.cloud)
  const saveStatus = useCloudSaveStore((state) => state.state?.status ?? null)
  const webglStatus = useWebglStore((state) => state.status)
  const [publication, setPublication] = useState<OwnerPublication | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const reviewRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef<HTMLButtonElement | null>(null)
  const reviewToggled = useRef(false)

  // The review replaces the button that opened it: move focus with it, and
  // back on Cancel, so keyboard users are not dropped on the page (#163).
  useEffect(() => {
    if (!reviewToggled.current) {
      return
    }

    reviewToggled.current = false
    ;(reviewing ? reviewRef.current : openRef.current)?.focus()
  }, [reviewing])
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'publishing' | 'unpublishing' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Good news goes through the same status line, without the warning colour.
  const [notice, setNotice] = useState<string | null>(null)
  const { status: copyStatus, copy } = useCopyStatus()
  const designId = cloud?.designId ?? null
  const headSeq = cloud?.headSeq ?? null
  const saved = saveStatus === 'saved'
  // Renders come from the 3D canvas, so no publish while it is down (#168).
  const renderBlocked = publishBlockedReason({ status: webglStatus })

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

    if (renderBlocked) {
      setMessage(renderBlocked)
      return
    }

    setBusy('publishing')
    setMessage(null)
    setNotice(null)
    const editor = useEditorStore.getState()

    // Published views show the tee alone, never the try-on mannequin. This
    // comes first so the wait for the atlas below covers the tee remounting;
    // a publish that stops short puts the figure back.
    const triedOn = editor.avatarId
    let published = false

    if (triedOn) {
      editor.setAvatarId({ avatarId: null })
    }

    try {
      if (await countUnavailableImages({ document: editor.document })) {
        setBusy(null)
        setMessage('An image on this design hasn’t loaded, so it would publish as a placeholder. Reload the page, or remove the image, and try again.')
        return
      }

      // Never photograph a garment still missing a word or image (R01 #164).
      const atlas = await waitForCurrentAtlas({
        current: () => {
          const { document, revision } = useEditorStore.getState()
          return { document, revision }
        },
      })

      // A word in a stand-in font still publishes, as the preview shows it.
      if (atlas === 'loading' || atlas === 'error') {
        setBusy(null)
        setMessage(
          atlas === 'loading'
            ? 'Artwork on this design is still loading. Wait a moment, then publish again.'
            : 'Some artwork on this design could not load, so it wouldn’t publish correctly. Reload the page, then publish again.',
        )
        return
      }

      const stills = await captureAngleStills({
        canvas: getStudioCanvas(),
        setCameraPreset: editor.setCameraPreset,
        setCapturingAngles: editor.setCapturingAngles,
        restorePreset: editor.cameraPreset,
        presets: PUBLISHED_STILL_PRESETS,
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
        setMessage(failureSentence({ lead: 'The views could not be saved', reason: uploaded.message }))
        return
      }

      const result = await publishDesign({
        designId,
        seq: headSeq,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      })

      setBusy(null)

      if (!result.ok) {
        void trackAssumption({ name: 'publish_failed' })
        setMessage(failureSentence({ lead: 'Not published', reason: result.message }))
        return
      }

      published = true
      void trackAssumption({ name: 'publish_succeeded' })
      setNotice(`Published version ${headSeq}. Anyone with the link can view it.`)
      // The button that was pressed goes with the review (see the effect above).
      reviewToggled.current = true
      setReviewing(false)
      await refresh()
    } finally {
      if (triedOn && !published) {
        useEditorStore.getState().setAvatarId({ avatarId: triedOn })
      }
    }
  }

  async function unpublish() {
    if (!designId) {
      return
    }

    setBusy('unpublishing')
    setMessage(null)
    setNotice(null)
    const result = await unpublishDesign({ designId })
    setBusy(null)

    if (!result.ok) {
      setMessage(failureSentence({ lead: 'Still published', reason: result.message }))
      return
    }

    setNotice('Unpublished. The public link has stopped working.')
    await refresh()
    // The Unpublish button is gone now; don't drop keyboard users on the page.
    ;(reviewRef.current ?? openRef.current)?.focus()
  }

  const copyFeedback =
    copyStatus === 'copied'
      ? 'Link copied.'
      : copyStatus === 'failed'
        ? 'The link could not be copied. Select it above and copy it yourself.'
        : null
  // The preview starting is a normal wait, not a problem.
  const quietStatus =
    copyStatus === 'copied' || (copyStatus === 'idle' && saved && !message && (Boolean(notice) || webglStatus === 'checking'))

  return (
    <section className="flv-panel flex w-full flex-col gap-3 p-3" aria-label="Publish">
      {live && publication ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-body text-sm font-medium text-flv-ink">
            <Globe aria-hidden className="size-4 text-flv-accent" />
            Published v{publication.seq} · latest saved v{headSeq}
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
              onClick={() => void copy(shareUrl({ slug: publication.slug }))}
            >
              {copyStatus === 'copied' ? 'Link copied' : 'Copy link'}
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
        <p className="flex items-center gap-2 font-body text-sm text-flv-ink">
          <Lock aria-hidden className="size-4 text-flv-muted" />
          Private. Only you can see this design.
        </p>
      )}

      {/*
        Above the actions: the panel is anchored to the bottom of the studio,
        so a line below them coming or going (the 3D preview starting, Saved
        to cloud) moved the button out from under a click in progress.
      */}
      <p
        role="status"
        aria-live="polite"
        className={cn('min-h-5 font-body text-xs', quietStatus ? 'text-flv-muted' : 'text-flv-accent')}
      >
        {copyFeedback ??
          (!saved
            ? 'Publishing is available once the design shows Saved to cloud.'
            : (message ?? notice ?? renderBlocked))}
      </p>

      {reviewing ? (
        <div
          ref={reviewRef}
          tabIndex={-1}
          role="group"
          aria-label="Publish review"
          className="flex flex-col gap-3 border-t border-flv-line pt-3"
        >
          <p className="font-body text-sm">
            Publishing version <strong>v{headSeq}</strong> of “{cloud.title}”. Anyone with the link can view its five
            views (front, three-quarter, back and both sleeves), and public images can be copied. Later edits stay private until you publish again.
          </p>
          <label className="flex flex-col gap-1 font-body text-sm">
            Public display name (optional)
            <input
              value={displayName}
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              className="min-h-11 rounded-xl border border-flv-line bg-white px-3 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryClass}
              disabled={!saved || Boolean(renderBlocked) || busy !== null}
              onClick={() => void publish()}
            >
              {busy === 'publishing' ? 'Publishing…' : live ? `Publish v${headSeq}` : 'Confirm publish'}
            </button>
            <button
              type="button"
              className={quietClass}
              onClick={() => {
                reviewToggled.current = true
                setReviewing(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={openRef}
          type="button"
          className={primaryClass}
          disabled={!saved}
          onClick={() => {
            reviewToggled.current = true
            setReviewing(true)
          }}
        >
          {live ? (publication?.seq === headSeq ? 'Published' : 'Publish latest') : 'Publish…'}
        </button>
      )}
    </section>
  )
}
