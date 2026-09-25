import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
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
import { saveDraft } from '../../lib/design-draft'
import type { Design, DesignMethod } from '../../lib/design-schema'
import { angleStripPreset } from '../../lib/paint-layout'
import {
  useEditorStore,
  type AngleCameraPreset,
} from '../../lib/editor-store'
import { getFabricById } from '../../lib/fabrics'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import { decodeDocumentImages } from '../../lib/layer-images'
import { resolveDraftTitle } from '../../lib/look-title'
import { bakePublishedArt } from '../../lib/paint-atlas'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
} from '../../lib/studio-chrome'
import { trimAngleStillsForLook } from '../../lib/look-payload'

let studioCanvas: HTMLCanvasElement | null = null

const METHOD_OPTIONS: { id: DesignMethod; label: string }[] = [
  { id: 'draw', label: HOUSE_COPY.drawMode },
  { id: 'tech', label: HOUSE_COPY.techMode },
  { id: 'combined', label: HOUSE_COPY.combinedMethod },
]

const ANGLE_STRIP: { id: AngleCameraPreset; label: string }[] = [
  { id: 'front', label: HOUSE_COPY.angleFront },
  { id: 'threeQuarter', label: HOUSE_COPY.angleThreeQuarter },
  { id: 'back', label: HOUSE_COPY.angleBack },
]

type VisibilityOption = 'public' | 'private' | 'unlisted'

const VISIBILITY_OPTIONS: {
  id: VisibilityOption
  label: string
}[] = [
  { id: 'public', label: FLV_COPY.visibilityPublic },
  { id: 'private', label: FLV_COPY.visibilityPrivate },
  { id: 'unlisted', label: FLV_COPY.visibilityUnlisted },
]

const ATTACHMENT_OPTIONS = [
  { id: 'garment', label: FLV_COPY.attachGarment },
  { id: 'avatar', label: FLV_COPY.attachAvatar },
  { id: 'shoot', label: FLV_COPY.attachShoot },
  { id: 'video', label: FLV_COPY.attachVideo },
] as const

type AttachmentId = (typeof ATTACHMENT_OPTIONS)[number]['id']

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
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [inkError, setInkError] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<VisibilityOption>('public')
  const [attachments, setAttachments] = useState<AttachmentId[]>([
    'garment',
    'avatar',
  ])
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
  const [anglePreviews, setAnglePreviews] = useState<
    Partial<Record<AngleCameraPreset, string>>
  >({})

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

  useEffect(() => {
    let cancelled = false
    const stripPreset = angleStripPreset({ cameraPreset })

    void captureFramedStill({ canvas: studioCanvas }).then((still) => {
      if (cancelled || !still) {
        return
      }

      setAnglePreviews((current) => ({
        ...current,
        [stripPreset]: still,
      }))
    })

    return () => {
      cancelled = true
    }
  }, [cameraPreset, lookSerial])

  return (
    <form
      className="flv-panel flex w-full flex-col gap-3 p-3"
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

                if (angleStills.length > 0) {
                  setAnglePreviews({
                    front: angleStills[0],
                    threeQuarter: angleStills[1],
                    back: angleStills[2],
                  })
                }

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
                      ...(description.trim()
                        ? {
                            description: description
                              .trim()
                              .slice(0, 500),
                          }
                        : {}),
                      ...(visibility !== 'public' ? { visibility } : {}),
                      ...(attachments.length > 0
                        ? { attachments: [...attachments] }
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
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className={chromeKickerClass()}>{HOUSE_COPY.angles}</p>
          <p className={chromeMutedClass()}>Design details</p>
        </div>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={HOUSE_COPY.angles}
        >
          {ANGLE_STRIP.map((angle) => {
            const preview = anglePreviews[angle.id]
            const isCurrent = cameraPreset === angle.id

            return (
              <button
                key={angle.id}
                type="button"
                role="radio"
                disabled={busy}
                aria-checked={isCurrent}
                onClick={() => {
                  setCameraPreset({ cameraPreset: angle.id })
                }}
                className={cn(
                  'flex aspect-[4/5] flex-col overflow-hidden rounded-xl border bg-flv-soft',
                  {
                    'border-flv-accent': isCurrent,
                    'border-flv-line': !isCurrent,
                  },
                )}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-end justify-center bg-flv-line/30 p-2">
                    <span
                      className={cn(chromeTextClass(), {
                        'text-flv-accent': isCurrent,
                        'text-flv-muted': !isCurrent,
                      })}
                    >
                      {angle.label}
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-2">
        <span className={chromeKickerClass()}>{HOUSE_COPY.lookTitle}</span>
        <input
          value={draftTitle}
          disabled={busy}
          onChange={(event) => {
            setTitleTouched(true)
            setDraftTitle(event.target.value)
          }}
          className="min-h-11 rounded-xl border border-flv-line bg-flv-paper px-3 py-2 font-body text-sm text-flv-ink disabled:opacity-50"
        />
        <span className={chromeMutedClass()}>{draftTitle.length}/100</span>
      </label>
      <label className="flex min-w-0 flex-col gap-2">
        <span className={chromeKickerClass()}>
          {FLV_COPY.publishDescription}
        </span>
        <textarea
          value={description}
          disabled={busy}
          rows={3}
          onChange={(event) => {
            setDescription(event.target.value)
          }}
          className="min-h-20 rounded-xl border border-flv-line bg-flv-paper px-3 py-2 font-body text-sm text-flv-ink disabled:opacity-50"
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
                className={cn(
                  'min-h-9 rounded-full border px-3',
                  chromeTextClass(),
                  {
                    'border-flv-accent text-flv-accent': active,
                    'border-flv-line text-flv-muted hover:text-flv-accent':
                      !active,
                  },
                )}
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
            className="min-h-11 flex-1 rounded-xl border border-flv-line bg-flv-paper px-3 py-2 font-body text-sm text-flv-ink disabled:opacity-50"
          />
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.method}</p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={HOUSE_COPY.method}
        >
          {METHOD_OPTIONS.map((method) => (
            <button
              key={method.id}
              type="button"
              role="radio"
              disabled={busy}
              aria-checked={publishMethod === method.id}
              onClick={() => {
                setPublishMethod({ method: method.id })
              }}
              className={cn(
                'min-h-9 rounded-xl border px-3',
                chromeTextClass(),
                {
                  'border-flv-accent text-flv-accent':
                    publishMethod === method.id,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    publishMethod !== method.id,
                },
              )}
            >
              {method.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className={chromeKickerClass()}>Visibility</p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Visibility"
        >
          {VISIBILITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              disabled={busy}
              aria-checked={visibility === option.id}
              onClick={() => {
                setVisibility(option.id)
              }}
              className={cn(
                'min-h-9 rounded-full border px-3',
                chromeTextClass(),
                {
                  'border-flv-accent text-flv-accent':
                    visibility === option.id,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    visibility !== option.id,
                },
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className={chromeKickerClass()}>Attachments</p>
          <ConceptPreviewBadge />
        </div>
        <div className="flex flex-col gap-2">
          {ATTACHMENT_OPTIONS.map((option) => {
            const checked = attachments.includes(option.id)

            return (
              <label
                key={option.id}
                className="flex min-h-9 items-center gap-2"
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={checked}
                  onChange={() => {
                    setAttachments((current) =>
                      checked
                        ? current.filter((entry) => entry !== option.id)
                        : [...current, option.id],
                    )
                  }}
                  className="accent-[var(--color-flv-accent)]"
                />
                <span className={chromeTextClass()}>{option.label}</span>
              </label>
            )
          })}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className={chromeKickerClass()}>{HOUSE_COPY.challenge}</p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={HOUSE_COPY.challenge}
        >
          <button
            type="button"
            role="radio"
            disabled={busy}
            aria-checked={!challengeId}
            onClick={() => {
              setChallengeId({ challengeId: null })
            }}
            className={cn(
              'min-h-9 rounded-full border px-3',
              chromeTextClass(),
              {
                'border-flv-accent text-flv-accent': !challengeId,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  Boolean(challengeId),
              },
            )}
          >
            {HOUSE_COPY.allChallenges}
          </button>
          {challenges.map((challenge) => (
            <button
              key={challenge.id}
              type="button"
              role="radio"
              disabled={busy}
              aria-checked={challengeId === challenge.id}
              onClick={() => {
                setChallengeId({ challengeId: challenge.id })
              }}
              className={cn(
                'min-h-9 rounded-full border px-3',
                chromeTextClass(),
                {
                  'border-flv-accent text-flv-accent':
                    challengeId === challenge.id,
                  'border-flv-line text-flv-muted hover:text-flv-accent':
                    challengeId !== challenge.id,
                },
              )}
            >
              {challenge.title}
            </button>
          ))}
        </div>
      </div>
      {inkError ? (
        <p className="w-full font-body text-sm text-flv-muted">{inkError}</p>
      ) : null}
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy || savingDraft}
          onClick={() => {
            setSavingDraft(true)
            setDraftSaved(false)
            void saveDraft({
              garmentId,
              document: designDocument,
            }).then((payload) => {
              setSavingDraft(false)
              setDraftSaved(Boolean(payload))
            })
          }}
          className={cn(
            'min-h-12 w-full shrink-0 border border-flv-line px-4 py-2 text-flv-muted hover:text-flv-accent disabled:opacity-50 sm:w-auto sm:px-5',
            chromeTextClass(),
          )}
        >
          {savingDraft ? 'Saving…' : FLV_COPY.saveDraft}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flv-cta min-h-12 w-full shrink-0 px-4 py-2 font-body text-xs tracking-[0.08em] uppercase disabled:opacity-50 sm:flex-1 sm:px-5"
        >
          {busy ? HOUSE_COPY.entering : `${HOUSE_COPY.enter} →`}
        </button>
      </div>
      {draftSaved ? (
        <p className={chromeMutedClass()}>Draft saved on this device.</p>
      ) : null}
    </form>
  )
}
