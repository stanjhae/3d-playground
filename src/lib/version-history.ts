import {
  CANONICAL_PANEL_IDS,
  type CanonicalDocument,
  type CanonicalPanelId,
  type Color,
} from './canonical-document.ts'
import type { FlpResult } from './flp-api/client.ts'
import {
  type VersionPage,
  type VersionResponse,
  type VersionSummary,
  checkpointLabelIssues,
} from './flp-api/contract.ts'
import type { SaveController } from './save-controller.ts'

/**
 * Cloud history panel logic (S07 #176, S08 #177), kept pure or with
 * injected I/O so pagination, labels and the restore order are testable.
 */

export type HistoryList = {
  versions: VersionSummary[]
  nextBefore: number | null
  headSeq: number | null
  publishedSeq: number | null
}

export const EMPTY_HISTORY: HistoryList = {
  versions: [],
  nextBefore: null,
  headSeq: null,
  publishedSeq: null,
}

/**
 * Adds a page. A first page (`append: false`) replaces the list; an older
 * page appends. Either way the list stays newest-first with one row per
 * seq, so a version saved between pages never shows twice.
 */
export function mergeHistoryPage({
  list,
  page,
  append,
}: {
  list: HistoryList
  page: VersionPage
  append: boolean
}): HistoryList {
  const bySeq = new Map<number, VersionSummary>()

  for (const version of [...(append ? list.versions : []), ...page.versions]) {
    bySeq.set(version.seq, version)
  }

  return {
    versions: [...bySeq.values()].sort((a, b) => b.seq - a.seq),
    nextBefore: page.nextBefore,
    headSeq: page.headSeq,
    publishedSeq: page.publishedSeq,
  }
}

const KIND_LABELS: Record<VersionSummary['kind'], string> = {
  autosave: 'Autosave',
  checkpoint: 'Checkpoint',
  restore: 'Restore',
  import: 'Import',
}

export type VersionRow = {
  seq: number
  title: string
  kind: string
  when: string
  badges: string[]
  /** Restoring the current head would only copy it. */
  canRestore: boolean
}

/** How long ago `createdAt` was, coarse enough to stay readable. */
export function formatVersionTime({
  createdAt,
  now = Date.now(),
}: {
  createdAt: string
  now?: number
}) {
  const at = Date.parse(createdAt)

  if (Number.isNaN(at)) {
    return ''
  }

  const minutes = Math.floor((now - at) / 60_000)

  if (minutes < 1) {
    return 'Just now'
  }

  if (minutes < 60) {
    return `${minutes} min ago`
  }

  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)} h ago`
  }

  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  })
}

export function versionRow({
  version,
  headSeq,
  publishedSeq,
  now,
}: {
  version: VersionSummary
  headSeq: number | null
  publishedSeq: number | null
  now?: number
}): VersionRow {
  const badges: string[] = []

  if (version.seq === headSeq) {
    badges.push('Current')
  }

  if (version.seq === publishedSeq) {
    badges.push('Published')
  }

  if (version.restoredFromSeq !== null) {
    badges.push(`From v${version.restoredFromSeq}`)
  }

  return {
    seq: version.seq,
    title: version.label ?? `Version ${version.seq}`,
    kind: KIND_LABELS[version.kind],
    when: formatVersionTime({ createdAt: version.createdAt, now }),
    badges,
    canRestore: version.seq !== headSeq,
  }
}

/** Trims a checkpoint name and checks it as the server will. */
export function checkCheckpointName({ name }: { name: string }) {
  const label = name.replace(/\s+/g, ' ').trim()
  const issue = checkpointLabelIssues({ value: label })[0]
  return issue ? { ok: false as const, message: issue.message } : { ok: true as const, label }
}

export type VersionPreview = {
  base: { label: string; colors: Color[] }
  panels: Array<{
    panel: CanonicalPanelId
    layers: Array<{ kind: 'paint' | 'image' | 'text'; label: string; hidden: boolean }>
  }>
  layerCount: number
}

/**
 * A read-only description of a version's content. It never reaches the
 * editor store, so previewing cannot change the draft or its revision.
 */
export function previewVersion({ document }: { document: CanonicalDocument }): VersionPreview {
  const base =
    document.base.kind === 'solid'
      ? { label: 'Solid', colors: [document.base.color] }
      : { label: document.base.kind === 'stripes' ? 'Stripes' : 'Check', colors: [...document.base.colors] }
  const panels = CANONICAL_PANEL_IDS.map((panel) => ({
    panel,
    layers: [...document.panels[panel].layers].reverse().map((layer) => ({
      kind: layer.kind,
      hidden: !layer.visible,
      label:
        layer.name ??
        (layer.kind === 'text'
          ? `“${layer.content}”`
          : layer.kind === 'image'
            ? 'Graphic'
            : `Paint · ${layer.strokes.length} stroke${layer.strokes.length === 1 ? '' : 's'}`),
    })),
  }))

  return { base, panels, layerCount: panels.reduce((sum, panel) => sum + panel.layers.length, 0) }
}

export type RestoreOutcome =
  | { ok: true; version: VersionResponse; reloaded: boolean }
  | { ok: false; step: 'save' | 'restore'; message: string }

/**
 * Restore `fromSeq` (S08 #177):
 * 1. with `saveFirst`, save pending work and stop if that fails;
 * 2. hold autosave so the head is settled and nothing races the restore;
 * 3. append the restore version against that head (409 if it moved);
 * 4. only after the acknowledgement, reload the draft from the cloud.
 * Publication is never touched. A failure releases autosave, so pending
 * work keeps saving.
 */
export async function restoreFromHistory({
  fromSeq,
  saveFirst,
  controller,
  restore,
  reload,
  mutationKey = crypto.randomUUID(),
}: {
  fromSeq: number
  saveFirst: boolean
  controller: Pick<SaveController, 'getState' | 'settle' | 'hold' | 'release'>
  restore: (request: {
    baseSeq: number
    fromSeq: number
    mutationKey: string
  }) => Promise<FlpResult<VersionResponse>>
  reload: () => Promise<boolean>
  mutationKey?: string
}): Promise<RestoreOutcome> {
  if (controller.getState().status === 'conflict') {
    return {
      ok: false,
      step: 'save',
      message: 'This design changed somewhere else. Open the cloud version before restoring.',
    }
  }

  if (saveFirst && controller.getState().status !== 'saved') {
    const settled = await controller.settle()

    if (settled.status !== 'saved') {
      return {
        ok: false,
        step: 'save',
        message: settled.message ?? 'Your current work could not be saved, so nothing was restored.',
      }
    }
  }

  const held = await controller.hold()
  const result = await restore({ baseSeq: held.headSeq, fromSeq, mutationKey })

  if (!result.ok) {
    controller.release()
    return {
      ok: false,
      step: 'restore',
      message:
        result.code === 'conflict'
          ? 'This design changed while restoring. Nothing was restored; refresh and try again.'
          : result.code === 'not_found'
            ? 'That version is not available.'
            : result.message,
    }
  }

  return { ok: true, version: result.data, reloaded: await reload() }
}
