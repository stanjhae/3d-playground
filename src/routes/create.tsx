import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { AvatarRail } from '../components/editor/AvatarRail'
import { CameraPresetBar } from '../components/editor/CameraPresetBar'
import { ColorPatternPanel } from '../components/editor/ColorPatternPanel'
import { CreateStepper } from '../components/editor/CreateStepper'
import { DesignModeToggle } from '../components/editor/DesignModeToggle'
import { DualStudio } from '../components/editor/DualStudio'
import { PaintCanvas } from '../components/editor/PaintCanvas'
import { GraphicLibrary } from '../components/editor/GraphicLibrary'
import { LayerRail } from '../components/editor/LayerRail'
import { PaintToolbar } from '../components/editor/PaintToolbar'
import { StructureRail } from '../components/editor/StructureRail'
import { StudioViewToggle } from '../components/editor/StudioViewToggle'
import { TechInspector } from '../components/editor/TechInspector'
import { VersionRail } from '../components/editor/VersionRail'
import { HistoryPanel } from '../components/editor/HistoryPanel'
import { GownCredit } from '../components/editor/GownCredit'
import { ModeToggle } from '../components/editor/ModeToggle'
import {
  PublishBar,
  PublishThumbnailSync,
} from '../components/editor/PublishBar'
import { SilhouetteSwitch } from '../components/editor/SilhouetteSwitch'
import { AtelierScene } from '../components/scene/AtelierScene'
import { RequireSession } from '../components/auth/RequireSession'
import { CloudPublish } from '../components/editor/CloudPublish'
import {
  CloudSaveStatus,
  RecoveryPrompt,
  useCloudAutosave,
  useRecoveryStore,
} from '../components/editor/CloudSave'
import { accountGuard, useSessionStore, waitForSession } from '../lib/auth/session-store'
import {
  RECOVERY_WARNINGS,
  type RecoveryRead,
  clearRecovery,
  readRecovery,
  recoveryOffer,
} from '../lib/cloud-recovery'
import { resolveUploadedSources, uploadedAssetIds } from '../lib/uploaded-images'
import { AUTH_REQUIRED, getSupabaseClient } from '../lib/auth/supabase-client'
import { isCanonicalGarment } from '../lib/concept-flags'
import { loadCloudDesign } from '../lib/cloud-design-load'
import { FLV_COPY } from '../lib/flv-copy'
import {
  allowsDrawView,
  showsPaintPane,
  showsColorRail,
  showsDesignRails,
  showsPreviewRails,
  showsShareRail,
  showsSilhouetteRail,
  showsStructureRail,
} from '../lib/create-steps'
import { parseCreateSearch } from '../lib/create-search'
import { loadDraft, saveDraft } from '../lib/design-draft'
import { createDesign, getDesign } from '../lib/designs-api'
import { getAssetSources, getCanonicalDocument, useEditorStore } from '../lib/editor-store'
import { garmentCanPaint } from '../lib/garments'
import {
  STUDIO_CHROME_BOTTOM_VAR,
  STUDIO_TOP_VAR,
  studioHeaderClass,
  studioOverlayClass,
  studioPhoneDrawClass,
  studioSectionClass,
} from '../lib/studio-chrome'
import { useLgUp } from '../lib/viewport'
import { resolveFetchedLook } from '../lib/fetched-look'
import { HOUSE_COPY, remixCaption } from '../lib/house-copy'
import { consumeLandingHandoff } from '../lib/landing-handoff'
import {
  coverHeaderSpacerClass,
  emptyStepClass,
  studioPhonePublishClass,
  studioPhoneToolsClass,
} from '../lib/studio-chrome'

export const Route = createFileRoute('/create')({
  validateSearch: (
    search: Record<string, unknown>,
  ) => parseCreateSearch({ search }),
  beforeLoad: async ({ location }) => {
    if (!AUTH_REQUIRED) {
      return
    }

    const session = await waitForSession({ client: getSupabaseClient() })

    if (session.status !== 'signed-in') {
      throw redirect({ to: '/sign-in', search: { returnTo: location.href } })
    }

    // Signed-in work lives in owned cloud designs: start from My Studio
    // unless a cloud design (or a board remix) is named.
    const search = location.search as { cloud?: string; design?: string }

    if (!search.cloud && !search.design) {
      throw redirect({ to: '/studio' })
    }
  },
  component: GuardedAtelier,
})

function GuardedAtelier() {
  return (
    <RequireSession>
      <AtelierHome />
    </RequireSession>
  )
}

function AtelierHome() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const {
    cloud: cloudId,
    design: remixId,
    step: entryStep,
    garment: entryGarment,
    color: entryColor,
    neck: entryNeck,
    hem: entryHem,
    sleeve: entrySleeve,
  } = search
  const mode = useEditorStore((state) => state.mode)
  const garmentId = useEditorStore((state) => state.garmentId)
  const createStep = useEditorStore((state) => state.createStep)
  const designEditMode = useEditorStore((state) => state.designEditMode)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)
  const setGarmentId = useEditorStore((state) => state.setGarmentId)
  const applyBaseColor = useEditorStore((state) => state.applyBaseColor)
  const setStructural = useEditorStore((state) => state.setStructural)
  const studioView = useEditorStore((state) => state.studioView)
  const canPaint = garmentCanPaint({ garmentId })
  const lgUp = useLgUp()
  const drawInFlow =
    !lgUp &&
    mode === 'design' &&
    canPaint &&
    showsPaintPane({ step: createStep }) &&
    studioView === 'draw'
  const sectionRef = useRef<HTMLElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [enteredLabel, setEnteredLabel] = useState<string | null>(null)
  const [remixTitle, setRemixTitle] = useState<string | null>(null)
  const [remixStatus, setRemixStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'missing' | 'error'
  >('idle')
  useCloudAutosave()
  const [cloudStatus, setCloudStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'missing' | 'unsupported' | 'error'
  >('idle')

  useEffect(() => {
    if (!cloudId) {
      setCloudStatus('idle')
      return
    }

    let cancelled = false
    setCloudStatus('loading')
    const stillSameAccount = accountGuard()
    const ownerId = useSessionStore.getState().account?.userId ?? null
    const storage = useRecoveryStore.getState().storage
    useRecoveryStore.setState({ designId: null, offer: null, warning: null })

    // Local recovery is looked up only under the signed-in owner (S05 #174).
    const recovery: Promise<RecoveryRead> = ownerId
      ? readRecovery({ storage, ownerId, designId: cloudId })
      : Promise.resolve({ status: 'none' })

    void Promise.all([
      loadCloudDesign({ designId: cloudId, isCurrent: () => !cancelled }),
      recovery,
    ]).then(([result, read]) => {
      if (cancelled || !stillSameAccount()) {
        return
      }

      if (!result.ok) {
        setCloudStatus(result.reason === 'account-changed' ? 'idle' : result.reason)
        return
      }

      const loaded = useEditorStore.getState().cloud
      const offer = loaded
        ? recoveryOffer({
            read,
            cloudHeadSeq: loaded.headSeq,
            cloudDocument: getCanonicalDocument(),
          })
        : ({ kind: 'none' } as const)

      // A local copy identical to the cloud needs no question.
      if (offer.kind === 'none' && read.status === 'found' && ownerId) {
        void clearRecovery({ storage, ownerId, designId: cloudId })
      }

      useRecoveryStore.setState({
        designId: cloudId,
        offer: offer.kind === 'none' ? null : offer,
        warning:
          read.status === 'unavailable'
            ? RECOVERY_WARNINGS[read.reason]
            : read.status === 'corrupt'
              ? RECOVERY_WARNINGS.corrupt
              : null,
      })
      setCloudStatus('loaded')
    })

    return () => {
      cancelled = true
    }
  }, [cloudId])

  // Uploaded images in an opened (or recovered) cloud design: fetch bytes
  // for any asset id the renderer cannot draw yet.
  const revision = useEditorStore((state) => state.revision)
  const resolving = useRef(new Set<string>())

  useEffect(() => {
    if (cloudStatus !== 'loaded') {
      return
    }

    const stillSameAccount = accountGuard()
    const known = { ...getAssetSources() }
    const document = getCanonicalDocument()
    const missing = uploadedAssetIds({ document }).filter(
      (assetId) => !known[assetId] && !resolving.current.has(assetId),
    )

    if (missing.length === 0) {
      return
    }

    // Ids already being fetched count as known so each is fetched once.
    for (const assetId of resolving.current) {
      known[assetId] = 'pending'
    }

    for (const assetId of missing) {
      resolving.current.add(assetId)
    }

    void resolveUploadedSources({ document, known }).then((sources) => {
      for (const assetId of missing) {
        resolving.current.delete(assetId)
      }

      if (stillSameAccount() && Object.keys(sources).length > 0) {
        useEditorStore.getState().registerAssetSources({ sources })
      }
    })
  }, [cloudStatus, revision])

  useEffect(() => {
    if (remixId || cloudId) {
      return
    }

    const handoff = consumeLandingHandoff()

    if (!handoff) {
      return
    }

    useEditorStore.getState().hydrateDocument({
      document: handoff.document,
      garmentId: handoff.garmentId,
    })

    if (handoff.color) {
      useEditorStore.getState().applyBaseColor({ color: handoff.color })
    }

    if (handoff.neck || handoff.hem || handoff.sleeve) {
      useEditorStore.getState().setStructural({
        structural: {
          ...(handoff.neck ? { neck: handoff.neck } : {}),
          ...(handoff.hem ? { hem: handoff.hem } : {}),
          ...(handoff.sleeve ? { sleeve: handoff.sleeve } : {}),
        },
      })
    }
  }, [cloudId, remixId])

  useEffect(() => {
    if (!entryStep) {
      return
    }

    setCreateStep({ createStep: entryStep })
  }, [entryStep, setCreateStep])

  useEffect(() => {
    if (!entryGarment) {
      return
    }

    setGarmentId({ garmentId: entryGarment })
  }, [entryGarment, setGarmentId])

  useEffect(() => {
    if (!entryColor) {
      return
    }

    applyBaseColor({ color: entryColor })
  }, [applyBaseColor, entryColor])

  useEffect(() => {
    if (!entryNeck && !entryHem && !entrySleeve) {
      return
    }

    setStructural({
      structural: {
        ...(entryNeck ? { neck: entryNeck } : {}),
        ...(entryHem ? { hem: entryHem } : {}),
        ...(entrySleeve ? { sleeve: entrySleeve } : {}),
      },
    })
  }, [entryHem, entryNeck, entrySleeve, setStructural])

  useEffect(() => {
    // Compare with the store's current step, not this render's: the entry
    // effect above may have just applied ?step=, and a stale value here
    // made the two effects rewrite each other forever (frozen studio).
    const current = useEditorStore.getState().createStep

    if (search.step === current) {
      return
    }

    void navigate({
      to: '/create',
      search: (previous) => ({
        ...previous,
        step: current,
      }),
      replace: true,
    })
  }, [createStep, navigate, search.step])

  useEffect(() => {
    let cancelled = false

    void loadDraft().then((draft) => {
      if (
        cancelled ||
        // The guest draft is shared by the browser; never into an account.
        useSessionStore.getState().status === 'signed-in' ||
        !draft ||
        remixId ||
        cloudId ||
        entryGarment ||
        entryStep ||
        entryColor ||
        entryNeck ||
        entryHem ||
        entrySleeve
      ) {
        return
      }

      useEditorStore.getState().hydrateDocument({
        document: draft.document,
        garmentId: draft.garmentId,
      })
    })

    return () => {
      cancelled = true
    }
  }, [
    entryColor,
    entryGarment,
    entryHem,
    entryNeck,
    entrySleeve,
    entryStep,
    cloudId,
    remixId,
  ])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const state = useEditorStore.getState()

      // Cloud designs autosave to the account (S04 #173) with owner-scoped
      // recovery (S05 #174); the shared guest draft is for signed-out work.
      if (state.cloud || useSessionStore.getState().status === 'signed-in') {
        return
      }

      void saveDraft({
        garmentId: state.garmentId,
        document: state.document,
      })
    }, 800)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!remixId) {
      setRemixStatus('idle')
      setRemixTitle(null)
      return
    }

    let cancelled = false
    setRemixStatus('loading')

    void getDesign({ id: remixId })
      .then((design) => {
        if (cancelled) {
          return
        }

        const resolved = resolveFetchedLook({ failed: false, design })

        if (resolved.status === 'ready' && resolved.design) {
          useEditorStore.getState().loadDesign({ design: resolved.design })
          setRemixTitle(resolved.design.title)
          setRemixStatus('loaded')
          return
        }

        setRemixTitle(null)
        setRemixStatus(
          resolved.status === 'missing' ? 'missing' : 'error',
        )
      })
      .catch(() => {
        if (!cancelled) {
          setRemixTitle(null)
          setRemixStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [remixId])

  // The lg studio grid starts below the header, however it wraps (#163).
  useLayoutEffect(() => {
    const section = sectionRef.current
    const header = headerRef.current

    if (!section || !header || typeof ResizeObserver === 'undefined') {
      return
    }

    const measure = () => {
      const top = section.getBoundingClientRect().top
      const bottom = header.getBoundingClientRect().bottom - top
      section.style.setProperty(STUDIO_CHROME_BOTTOM_VAR, `${Math.ceil(bottom)}px`)
      // The site header is sticky above the section; fill only what is left.
      section.style.setProperty(STUDIO_TOP_VAR, `${Math.max(0, Math.round(top + window.scrollY))}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(section)
    observer.observe(header)
    measure()
    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <section ref={sectionRef} className={studioSectionClass()}>
      <DualStudio>
        <AtelierScene>
          <PublishThumbnailSync />
        </AtelierScene>
      </DualStudio>
      <div className={studioOverlayClass({ drawInFlow })}>
        {drawInFlow ? null : (
          <div
            aria-hidden
            className={coverHeaderSpacerClass()}
          />
        )}
        <div ref={headerRef} className={studioHeaderClass()}>
          <ModeToggle mode={mode} />
          {mode === 'design' ? <CreateStepper /> : null}
          {mode === 'design' && showsSilhouetteRail({ step: createStep }) ? (
            <SilhouetteSwitch />
          ) : null}
          {mode === 'design' &&
          canPaint &&
          allowsDrawView({ step: createStep }) ? (
            <StudioViewToggle />
          ) : null}
          {mode === 'design' &&
          canPaint &&
          showsDesignRails({ step: createStep }) ? (
            <DesignModeToggle />
          ) : null}
          {mode === 'design' && showsPreviewRails({ step: createStep }) ? (
            <CameraPresetBar />
          ) : null}
          {mode === 'design' ? (
            <GownCredit garmentId={garmentId} />
          ) : null}
          {cloudStatus === 'loaded' ? <CloudSaveStatus /> : null}
          {cloudStatus === 'loaded' ? <RecoveryPrompt /> : null}
          {cloudStatus === 'loading' ? (
            <p className="font-body text-sm text-flv-muted">Opening your design…</p>
          ) : null}
          {cloudStatus === 'missing' ||
          cloudStatus === 'error' ||
          cloudStatus === 'unsupported' ? (
            <p role="alert" className="font-body text-sm text-flv-accent">
              {cloudStatus === 'missing'
                ? 'This design is not available.'
                : cloudStatus === 'unsupported'
                  ? 'This design uses a garment template this app cannot open.'
                  : 'This design could not open.'}{' '}
              <Link to="/studio" className="underline">
                Back to My Studio
              </Link>
            </p>
          ) : null}
          {remixStatus === 'loading' ? (
            <p className="font-body text-sm text-flv-muted">
              {HOUSE_COPY.lookLoading}
            </p>
          ) : null}
          {remixStatus === 'loaded' && remixTitle ? (
            <p className="font-body text-xs tracking-[0.08em] text-flv-accent uppercase">
              {remixCaption({ title: remixTitle })}
            </p>
          ) : null}
          {remixStatus === 'missing' ? (
            <p className="font-body text-sm text-flv-muted">
              {HOUSE_COPY.lookGone} {HOUSE_COPY.studioOpen}
            </p>
          ) : null}
          {remixStatus === 'error' ? (
            <p className="font-body text-sm text-flv-muted">
              {HOUSE_COPY.lookFailed} {HOUSE_COPY.studioOpen}
            </p>
          ) : null}
        </div>
        {drawInFlow ? (
          <div className={studioPhoneDrawClass()}>
            <PaintCanvas layout="quad" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 lg:hidden" />
        )}
        {mode === 'design' ? (
          <>
            <div className={studioPhoneToolsClass({ drawInFlow })}>
              {showsColorRail({ step: createStep }) ? (
                <ColorPatternPanel />
              ) : null}
              {showsStructureRail({ step: createStep }) &&
              !isCanonicalGarment({ garmentId }) ? (
                <StructureRail />
              ) : null}
              {showsDesignRails({ step: createStep }) && canPaint ? (
                <>
                  <PaintToolbar
                    tools={
                      designEditMode === 'tech' ? 'placeables' : 'all'
                    }
                  />
                  {designEditMode === 'tech' ? <GraphicLibrary /> : null}
                  <LayerRail />
                  {designEditMode === 'tech' ? <TechInspector /> : null}
                  <VersionRail />
                  <HistoryPanel />
                </>
              ) : null}
              {showsDesignRails({ step: createStep }) && !canPaint ? (
                <div className={emptyStepClass()}>
                  <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
                    {FLV_COPY.designEmptyTitle}
                  </p>
                  <p className="font-body text-sm text-flv-muted">
                    {FLV_COPY.designEmptyLead}
                  </p>
                </div>
              ) : null}
              {showsPreviewRails({ step: createStep }) ? (
                <AvatarRail />
              ) : null}
            </div>
            <div className={studioPhonePublishClass()}>
              {publishError ? (
                <p className="font-body text-sm text-flv-muted">
                  {publishError}
                </p>
              ) : null}
              {enteredLabel ? (
                <p className="font-body text-xs tracking-[0.08em] text-flv-accent uppercase">
                  {enteredLabel}
                </p>
              ) : null}
              {showsShareRail({ step: createStep }) && cloudStatus === 'loaded' ? (
                <CloudPublish />
              ) : showsShareRail({ step: createStep }) && AUTH_REQUIRED ? (
                <p className="font-body text-sm text-flv-muted">
                  Publishing works from your own designs.{' '}
                  <Link to="/studio" className="underline">
                    Open My Studio
                  </Link>
                </p>
              ) : showsShareRail({ step: createStep }) ? (
                <PublishBar
                  publishing={publishing}
                  onPublish={async ({ design }) => {
                    setPublishError(null)
                    setPublishing(true)

                    try {
                      const created = await createDesign({ design })
                      useEditorStore.getState().publishLook({ design })
                      setEnteredLabel(HOUSE_COPY.entered)
                      await navigate({
                        to: '/vote',
                        search: { entered: created.id },
                      })
                    } catch (error) {
                      setPublishError(
                        error instanceof Error
                          ? error.message
                          : HOUSE_COPY.publishFailed,
                      )
                    } finally {
                      setPublishing(false)
                    }
                  }}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
