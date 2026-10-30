import { useEffect, useRef, useState } from 'react'

import { validateCanonicalDocument } from '../../lib/canonical-document'
import { loadCloudDesign } from '../../lib/cloud-design-load'
import { cn } from '../../lib/cn'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import {
  getDesignVersion,
  listDesignVersions,
  restoreDesignVersion,
} from '../../lib/flp-api/client'
import { MAX_CHECKPOINT_LABEL } from '../../lib/flp-api/contract'
import {
  EMPTY_HISTORY,
  type HistoryList,
  type VersionPreview,
  checkCheckpointName,
  mergeHistoryPage,
  previewVersion,
  restoreFromHistory,
  versionRow,
} from '../../lib/version-history'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import { useCloudSaveStore } from './CloudSave'

const action =
  'min-h-11 text-flv-muted hover:text-flv-accent disabled:opacity-40 disabled:hover:text-flv-muted'

/**
 * Cloud history for the open owned design (S07 #176, S08 #177): versions
 * newest first with "Load more", a read-only preview, named checkpoints
 * and restore as a new version. Hidden outside `/create?cloud=`.
 */
export function HistoryPanel() {
  const cloud = useEditorStore((state) => state.cloud)
  const controller = useCloudSaveStore((store) => store.controller)
  const saveStatus = useCloudSaveStore((store) => store.state?.status ?? null)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<HistoryList>(EMPTY_HISTORY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<
    { seq: number; status: 'loading' } | { seq: number; status: 'ready'; preview: VersionPreview } | null
  >(null)
  const [naming, setNaming] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<{ seq: number; saveFirst: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const restoreKey = useRef<string | null>(null)
  const designId = cloud?.designId ?? null

  async function loadPage({ append }: { append: boolean }) {
    if (!designId) {
      return
    }

    setLoading(true)
    setError(null)
    const result = await listDesignVersions({
      designId,
      before: append ? list.nextBefore : null,
    })
    setLoading(false)

    if (useEditorStore.getState().cloud?.designId !== designId) {
      return
    }

    if (!result.ok) {
      setError(result.code === 'account-changed' ? null : 'History could not load.')
      return
    }

    setList((current) => mergeHistoryPage({ list: current, page: result.data, append }))
  }

  useEffect(() => {
    setList(EMPTY_HISTORY)
    setPreview(null)
    setRestoring(null)
    setNaming(null)
    setNotice(null)

    if (open && designId) {
      void loadPage({ append: false })
    }
    // Reload the first page when the panel opens or the design changes.
  }, [open, designId])

  if (!cloud) {
    return null
  }

  const headSeq = cloud.headSeq
  const unsaved = saveStatus !== null && saveStatus !== 'saved'
  const newer = list.versions.length > 0 && (list.versions[0]?.seq ?? 0) < headSeq

  async function showPreview({ seq }: { seq: number }) {
    if (!designId) {
      return
    }

    if (preview?.seq === seq) {
      setPreview(null)
      return
    }

    setPreview({ seq, status: 'loading' })
    const result = await getDesignVersion({ designId, seq })
    const checked = result.ok ? validateCanonicalDocument({ value: result.data.content }) : null

    if (!checked?.ok) {
      setPreview(null)
      setError(`Version ${seq} could not be previewed.`)
      return
    }

    setPreview((current) =>
      current?.seq === seq ? { seq, status: 'ready', preview: previewVersion({ document: checked.document }) } : current,
    )
  }

  async function saveCheckpoint() {
    const checked = checkCheckpointName({ name: naming ?? '' })

    if (!checked.ok) {
      setNameError(checked.message)
      return
    }

    if (!controller) {
      return
    }

    setBusy(true)
    const result = await controller.checkpoint({
      label: checked.label,
      revision: useEditorStore.getState().revision,
      document: getCanonicalDocument(),
    })
    setBusy(false)

    if (!result.ok) {
      setNameError(result.message)
      return
    }

    setNaming(null)
    setNameError(null)
    setNotice(`Saved checkpoint “${checked.label}” as v${result.data.seq}.`)
    void loadPage({ append: false })
  }

  async function confirmRestore() {
    if (!restoring || !controller || !designId) {
      return
    }

    restoreKey.current ??= crypto.randomUUID()
    setBusy(true)
    setError(null)
    const outcome = await restoreFromHistory({
      fromSeq: restoring.seq,
      saveFirst: restoring.saveFirst,
      controller,
      mutationKey: restoreKey.current,
      restore: (request) => restoreDesignVersion({ designId, request }),
      reload: async () => (await loadCloudDesign({ designId })).ok,
    })
    setBusy(false)

    if (!outcome.ok) {
      setError(outcome.message)

      if (outcome.step === 'restore') {
        // The head moved or the request failed; a new attempt gets a new key.
        restoreKey.current = null
      }
      return
    }

    restoreKey.current = null
    setRestoring(null)
    setPreview(null)
    setNotice(
      outcome.reloaded
        ? `Restored v${outcome.version.restoredFromSeq} as v${outcome.version.seq}. Your published look is unchanged.`
        : `Restored as v${outcome.version.seq}. Reload the page to open it.`,
    )
    void loadPage({ append: false })
  }

  return (
    <aside className={railFrameClass()} aria-label="Version history">
      <div className="flex items-center justify-between gap-2">
        <p className={chromeKickerClass()}>History</p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(action, chromeTextClass())}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open ? (
        <>
          {naming === null ? (
            <button
              type="button"
              disabled={busy || saveStatus === 'conflict'}
              onClick={() => {
                setNaming('')
                setNameError(null)
              }}
              className={cn(action, 'self-start', chromeTextClass())}
            >
              Save checkpoint
            </button>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void saveCheckpoint()
              }}
            >
              <label className={chromeMutedClass()} htmlFor="checkpoint-name">
                Checkpoint name
              </label>
              <input
                id="checkpoint-name"
                autoFocus
                value={naming}
                maxLength={MAX_CHECKPOINT_LABEL + 20}
                onChange={(event) => {
                  setNaming(event.target.value)
                  setNameError(null)
                }}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? 'checkpoint-name-error' : undefined}
                className="min-h-11 border border-flv-line bg-transparent px-2 font-body text-sm text-flv-ink"
              />
              {nameError ? (
                <p id="checkpoint-name-error" role="alert" className="font-body text-xs text-flv-accent">
                  {nameError}
                </p>
              ) : null}
              <div className="flex gap-3">
                <button type="submit" disabled={busy} className={cn(action, chromeTextClass())}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setNaming(null)}
                  className={cn(action, chromeTextClass())}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {notice ? (
            <p role="status" className="font-body text-xs text-flv-muted">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="font-body text-xs text-flv-accent">
              {error}
            </p>
          ) : null}
          {newer ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadPage({ append: false })}
              className={cn(action, 'self-start', chromeTextClass())}
            >
              Show latest
            </button>
          ) : null}
          <ol className="flex flex-col gap-1">
            {list.versions.map((version) => {
              const row = versionRow({ version, headSeq, publishedSeq: list.publishedSeq })
              const previewing = preview?.seq === row.seq

              return (
                <li key={row.seq} className="flex flex-col gap-1 border-t border-flv-line pt-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn('min-w-0 flex-1 truncate', chromeTextClass())}>
                      v{row.seq} · {row.title}
                    </span>
                    <span className={chromeMutedClass()}>
                      {row.kind} · {row.when}
                    </span>
                  </div>
                  {row.badges.length > 0 ? (
                    <p className="font-body text-[0.65rem] tracking-[0.12em] text-flv-accent uppercase">
                      {row.badges.join(' · ')}
                    </p>
                  ) : null}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      aria-expanded={previewing}
                      onClick={() => void showPreview({ seq: row.seq })}
                      className={cn(action, chromeTextClass())}
                    >
                      {previewing ? 'Close preview' : 'Preview'}
                    </button>
                    {row.canRestore ? (
                      <button
                        type="button"
                        disabled={busy || saveStatus === 'conflict'}
                        onClick={() => {
                          restoreKey.current = null
                          setError(null)
                          setRestoring({ seq: row.seq, saveFirst: true })
                        }}
                        className={cn(action, chromeTextClass())}
                      >
                        Restore
                      </button>
                    ) : null}
                  </div>
                  {previewing ? <PreviewBlock preview={preview} /> : null}
                  {restoring?.seq === row.seq ? (
                    <div
                      role="dialog"
                      aria-label={`Restore version ${row.seq}`}
                      className="flex flex-col gap-2 border border-flv-line p-2"
                    >
                      <p className="font-body text-sm text-flv-ink">
                        Restore v{row.seq} as a new version? Earlier versions stay in history, and your
                        published look does not change until you republish.
                      </p>
                      {unsaved ? (
                        <label className="flex items-center gap-2 font-body text-sm text-flv-ink">
                          <input
                            type="checkbox"
                            checked={restoring.saveFirst}
                            onChange={(event) =>
                              setRestoring({ seq: row.seq, saveFirst: event.target.checked })
                            }
                          />
                          Save current work first
                        </label>
                      ) : (
                        <p className={chromeMutedClass()}>Your current work is saved.</p>
                      )}
                      {unsaved && !restoring.saveFirst ? (
                        <p className="font-body text-xs text-flv-accent">Unsaved changes will be discarded.</p>
                      ) : null}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmRestore()}
                          className={cn(action, chromeTextClass())}
                        >
                          {busy ? 'Restoring…' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRestoring(null)}
                          className={cn(action, chromeTextClass())}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
          {loading ? <p className={chromeMutedClass()}>Loading history…</p> : null}
          {!loading && list.nextBefore !== null ? (
            <button
              type="button"
              onClick={() => void loadPage({ append: true })}
              className={cn(action, 'self-start', chromeTextClass())}
            >
              Load more
            </button>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}

function PreviewBlock({
  preview,
}: {
  preview: { status: 'loading' } | { status: 'ready'; preview: VersionPreview } | null
}) {
  if (!preview || preview.status === 'loading') {
    return <p className={chromeMutedClass()}>Loading preview…</p>
  }

  const { base, panels, layerCount } = preview.preview

  return (
    <div className="flex flex-col gap-1 bg-flv-paper/60 p-2" aria-label="Read-only preview">
      <p className={chromeMutedClass()}>Read-only preview · not your draft</p>
      <p className="flex items-center gap-2 font-body text-xs text-flv-ink">
        {base.colors.map((color) => (
          <span key={color} aria-hidden className="size-4 border border-flv-line" style={{ background: color }} />
        ))}
        {base.label} base · {layerCount} layer{layerCount === 1 ? '' : 's'}
      </p>
      {panels
        .filter((panel) => panel.layers.length > 0)
        .map((panel) => (
          <div key={panel.panel}>
            <p className={chromeKickerClass()}>{panel.panel}</p>
            <ul>
              {panel.layers.map((layer, index) => (
                <li
                  key={`${panel.panel}-${index}`}
                  className={cn('truncate font-body text-xs text-flv-ink', { 'opacity-50': layer.hidden })}
                >
                  {layer.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}
