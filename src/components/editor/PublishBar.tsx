import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { trackAssumption } from '../../lib/assumption-events'
import { listChallenges } from '../../lib/challenges'
import { cn } from '../../lib/cn'
import {
  captureAngleStills,
  captureFramedStill,
  shouldEnterLook,
} from '../../lib/capture-still'
import {
  documentHasInk,
  sanitizePublishedDocument,
} from '../../lib/design-document'
import type { Design, DesignMethod } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { getFabricById } from '../../lib/fabrics'
import { HOUSE_COPY } from '../../lib/house-copy'
import { decodeDocumentImages } from '../../lib/layer-images'
import { resolveDraftTitle } from '../../lib/look-title'
import { bakePublishedArt } from '../../lib/paint-atlas'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'
import { trimAngleStillsForLook } from '../../lib/look-payload'

let studioCanvas: HTMLCanvasElement | null = null

const METHOD_OPTIONS: { id: DesignMethod; label: string }[] = [
  { id: 'draw', label: HOUSE_COPY.drawMode },
  { id: 'tech', label: HOUSE_COPY.techMode },
  { id: 'combined', label: HOUSE_COPY.combinedMethod },
]

const SUGGESTED_TAGS = ['night', 'ivory', 'mark', 'house', 'soft', 'bold']

export function PublishThumbnailSync() {
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    studioCanvas = gl.domElement

    return () => {
      if (studioCanvas === gl.domElement) {
        studioCanvas = null
      }
    }
  }, [gl])

  return null
}

export function PublishBar({
  title,
  publishing = false,
  onPublish,
}: {
  title?: string
  publishing?: boolean
  onPublish?: ({
    design,
  }: {
    design: Omit<Design, 'id' | 'votes'>
  }) => void | Promise<void>
}) {
  const storeTitle = useEditorStore((state) => state.title)
  const author = useEditorStore((state) => state.author)
  const fabricId = useEditorStore((state) => state.fabricId)
  const garmentId = useEditorStore((state) => state.garmentId)
  const overrides = useEditorStore((state) => state.overrides)
  const designDocument = useEditorStore((state) => state.document)
  const publishTags = useEditorStore((state) => state.publishTags)
  const setPublishTags = useEditorStore((state) => state.setPublishTags)
  const publishMethod = useEditorStore((state) => state.publishMethod)
  const setPublishMethod = useEditorStore((state) => state.setPublishMethod)
  const challengeId = useEditorStore((state) => state.challengeId)
  const setChallengeId = useEditorStore((state) => state.setChallengeId)
  const avatarId = useEditorStore((state) => state.avatarId)
  const cameraPreset = useEditorStore((state) => state.cameraPreset)
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset)
  const setCapturingAngles = useEditorStore(
    (state) => state.setCapturingAngles,
  )
  const lookSerial = useEditorStore((state) => state.lookSerial)
  const fabricName = getFabricById({ id: fabricId ?? '' })?.name ?? 'Look'
  const [titleTouched, setTitleTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [inkError, setInkError] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const submittingRef = useRef(false)
  const busy = publishing || submitting
  const challenges = listChallenges()
  const [draftTitle, setDraftTitle] = useState(() =>
    resolveDraftTitle({
      title,
      storeTitle,
      fabricName,
      serial: lookSerial,
    }),
  )

  useEffect(() => {
    if (titleTouched) {
      return
    }

    setDraftTitle(
      resolveDraftTitle({
        title,
        storeTitle,
        fabricName,
        serial: lookSerial,
      }),
    )
  }, [fabricName, lookSerial, storeTitle, title, titleTouched])

  return (
    <form
      className="flex flex-row flex-wrap items-end gap-2 border border-atelier-line bg-atelier/92 p-3 backdrop-blur-sm sm:gap-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault()

        if (busy || submittingRef.current) {
          return
        }

        submittingRef.current = true
        setInkError(null)

        const resolvedTitle =
          draftTitle.trim() ||
          resolveDraftTitle({
            fabricName,
            serial: lookSerial,
          })

        setSubmitting(true)

        const ink = documentHasInk({ document: designDocument })

        void decodeDocumentImages({ document: designDocument })
          .then((images) => {
            const artMap = ink
              ? bakePublishedArt({
                  document: designDocument,
                  images,
                })
              : ''

            if (ink && !artMap) {
              setInkError(HOUSE_COPY.inkTooHeavy)
              return
            }

            return captureFramedStill({ canvas: studioCanvas }).then(
              async (thumbnailDataUrl) => {
                if (!shouldEnterLook({ thumbnailDataUrl })) {
                  setInkError(HOUSE_COPY.publishFailed)
                  return
                }

                const angleStills = await captureAngleStills({
                  canvas: studioCanvas,
                  setCameraPreset,
                  setCapturingAngles,
                  restorePreset: cameraPreset,
                })

                const trimmedAngles = trimAngleStillsForLook({
                  angleStills,
                  artMap,
                  hasDocument: Boolean(
                    sanitizePublishedDocument({ document: designDocument }),
                  ),
                })

                return Promise.resolve(
                  onPublish?.({
                    design: {
                      title: resolvedTitle,
                      author: author || 'Guest',
                      thumbnailDataUrl,
                      overrides: [...overrides],
                      garmentId,
                      createdAt: new Date().toISOString(),
                      ...(artMap ? { artMap } : {}),
                      ...(Object.keys(designDocument.structural).length > 0
                        ? { structural: designDocument.structural }
                        : {}),
                      ...(() => {
                        const document = sanitizePublishedDocument({
                          document: designDocument,
                        })
                        return document ? { document } : {}
                      })(),
                      ...(publishTags.length > 0
                        ? { tags: [...publishTags] }
                        : {}),
                      ...(publishMethod ? { method: publishMethod } : {}),
                      ...(challengeId ? { challengeId } : {}),
                      ...(avatarId ? { avatarId } : {}),
                      ...(trimmedAngles.length > 0
                        ? { angleStills: trimmedAngles }
                        : {}),
                    },
                  }),
                ).then(() => {
                  if (ink) {
                    void trackAssumption({ name: 'published' })
                  }
                })
              },
            )
          })
          .finally(() => {
            submittingRef.current = false
            setSubmitting(false)
          })
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-display text-xs tracking-[0.22em] text-brass uppercase">
          {HOUSE_COPY.lookTitle}
        </span>
        <input
          value={draftTitle}
          disabled={busy}
          onChange={(event) => {
            setTitleTouched(true)
            setDraftTitle(event.target.value)
          }}
          className="min-h-11 border border-atelier-line bg-atelier px-3 py-2 font-body text-sm text-ivory disabled:opacity-50"
        />
      </label>
      <div className="flex w-full flex-col gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.tags}</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_TAGS.map((tag) => {
            const active = publishTags.includes(tag)

            return (
              <button
                key={tag}
                type="button"
                disabled={busy}
                aria-pressed={active}
                onClick={() => {
                  setPublishTags({
                    tags: active
                      ? publishTags.filter((entry) => entry !== tag)
                      : [...publishTags, tag],
                  })
                }}
                className={cn('min-h-9 border px-3', chromeTextClass(), {
                  'border-brass text-brass': active,
                  'border-atelier-line text-ivory-muted hover:text-brass':
                    !active,
                })}
              >
                {tag}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            value={tagDraft}
            disabled={busy}
            placeholder={HOUSE_COPY.tags}
            onChange={(event) => {
              setTagDraft(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return
              }

              event.preventDefault()
              const next = tagDraft.trim()

              if (!next) {
                return
              }

              setPublishTags({ tags: [...publishTags, next] })
              setTagDraft('')
            }}
            className="min-h-11 flex-1 border border-atelier-line bg-atelier px-3 py-2 font-body text-sm text-ivory disabled:opacity-50"
          />
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.method}</p>
        <div className="flex flex-wrap gap-2">
          {METHOD_OPTIONS.map((method) => (
            <button
              key={method.id}
              type="button"
              disabled={busy}
              aria-pressed={publishMethod === method.id}
              onClick={() => {
                setPublishMethod({
                  method: publishMethod === method.id ? null : method.id,
                })
              }}
              className={cn('min-h-9 border px-3', chromeTextClass(), {
                'border-brass text-brass': publishMethod === method.id,
                'border-atelier-line text-ivory-muted hover:text-brass':
                  publishMethod !== method.id,
              })}
            >
              {method.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.challenge}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            aria-pressed={!challengeId}
            onClick={() => {
              setChallengeId({ challengeId: null })
            }}
            className={cn('min-h-9 border px-3', chromeTextClass(), {
              'border-brass text-brass': !challengeId,
              'border-atelier-line text-ivory-muted hover:text-brass':
                Boolean(challengeId),
            })}
          >
            {HOUSE_COPY.allChallenges}
          </button>
          {challenges.map((challenge) => (
            <button
              key={challenge.id}
              type="button"
              disabled={busy}
              aria-pressed={challengeId === challenge.id}
              onClick={() => {
                setChallengeId({
                  challengeId:
                    challengeId === challenge.id ? null : challenge.id,
                })
              }}
              className={cn('min-h-9 border px-3', chromeTextClass(), {
                'border-brass text-brass': challengeId === challenge.id,
                'border-atelier-line text-ivory-muted hover:text-brass':
                  challengeId !== challenge.id,
              })}
            >
              {challenge.title}
            </button>
          ))}
        </div>
      </div>
      {inkError ? (
        <p className="w-full font-body text-sm text-ivory-muted">{inkError}</p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 shrink-0 border border-brass px-4 py-2 font-body text-xs tracking-[0.08em] text-brass uppercase hover:bg-atelier disabled:opacity-50 sm:px-5"
      >
        {busy ? HOUSE_COPY.entering : HOUSE_COPY.enter}
      </button>
    </form>
  )
}
