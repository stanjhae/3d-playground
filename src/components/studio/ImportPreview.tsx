import { useMemo } from 'react'

import type { CanonicalDocument } from '../../lib/canonical-document'
import type { DesignDocument } from '../../lib/design-document'
import { importNoticeLines } from '../../lib/import-notice'
import type { ImportNote } from '../../lib/legacy-import'
import { atlasBufferToDataUrl, rasterizeLayers } from '../../lib/paint-atlas'
import { toRenderDocument } from '../../lib/render-projection'

/**
 * Before/after for a design carried over from the landing page (F06 #141):
 * the landing version and the studio version, drawn by the same atlas
 * renderer, with what the conversion changed. Nothing is saved until the
 * person chooses.
 */

const ATLAS_SIZE = 384
const buttonClass =
  'inline-flex min-h-11 items-center justify-center px-5 font-body text-xs tracking-[0.1em] uppercase disabled:opacity-50'

export function ImportPreview({
  before,
  after,
  notes,
  imageCount,
  uploadFailures,
  busy,
  onCreate,
  onCreateWithoutFailed,
  onStartEmpty,
}: {
  before: DesignDocument
  after: CanonicalDocument
  notes: ImportNote[]
  imageCount: number
  /** Why each image failed to upload on the last try; nothing was saved. */
  uploadFailures: string[]
  busy: boolean
  onCreate: () => void
  onCreateWithoutFailed: () => void
  onStartEmpty: () => void
}) {
  const images = useMemo(
    () => ({
      before: atlasBufferToDataUrl({ buffer: rasterizeLayers({ document: before, width: ATLAS_SIZE, height: ATLAS_SIZE }) }),
      after: atlasBufferToDataUrl({
        buffer: rasterizeLayers({ document: toRenderDocument({ document: after }).document, width: ATLAS_SIZE, height: ATLAS_SIZE }),
      }),
    }),
    [before, after],
  )
  const lines = importNoticeLines({ notes })

  return (
    <section aria-labelledby="import-preview-title" className="flex flex-col gap-4 border border-flv-line bg-flv-paper p-4">
      <h2 id="import-preview-title" className="font-display text-2xl">
        Bring your landing design into the studio
      </h2>
      <p className="font-body text-sm text-flv-muted">
        Front and back on top, sleeves below. Check it, then create it as a private design in your account.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['before', 'after'] as const).map((side) => (
          <figure key={side} className="flex min-w-0 flex-col gap-2">
            <img
              src={images[side]}
              alt={side === 'before' ? 'Your landing design, all four panels' : 'The studio version, all four panels'}
              className="aspect-square w-full border border-flv-line bg-white object-contain"
            />
            <figcaption className="font-body text-xs tracking-[0.08em] text-flv-muted uppercase">
              {side === 'before' ? 'On the landing page' : 'In the studio'}
            </figcaption>
          </figure>
        ))}
      </div>
      {lines.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-body text-sm">What changes:</p>
          <ul className="list-disc pl-5 font-body text-sm text-flv-muted">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {imageCount > 0 ? (
        <p className="font-body text-sm text-flv-muted">
          {imageCount === 1 ? '1 image is' : `${imageCount} images are`} uploaded to your account when you create the design.
        </p>
      ) : null}
      {uploadFailures.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1 font-body text-sm text-flv-accent">
          <p>
            {uploadFailures.length === 1 ? '1 image' : `${uploadFailures.length} images`} could not be uploaded, so nothing was
            created yet. Try again, or create the design without {uploadFailures.length === 1 ? 'it' : 'them'}.
          </p>
          <ul className="list-disc pl-5">
            {[...new Set(uploadFailures)].map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={`flv-cta inline-flex items-center justify-center gap-2 ${buttonClass}`} disabled={busy} onClick={onCreate}>
          {busy ? 'Creating…' : uploadFailures.length > 0 ? 'Try again' : 'Create this design'}
        </button>
        {uploadFailures.length > 0 ? (
          <button type="button" className={`border border-flv-line ${buttonClass}`} disabled={busy} onClick={onCreateWithoutFailed}>
            Create without {uploadFailures.length === 1 ? 'that image' : 'those images'}
          </button>
        ) : null}
        <button type="button" className={`border border-flv-line ${buttonClass}`} disabled={busy} onClick={onStartEmpty}>
          Start with an empty tee
        </button>
      </div>
    </section>
  )
}
