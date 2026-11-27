import type { SupabaseClient } from '@supabase/supabase-js'

import { LIBRARY_ASSET_PREFIX } from './contract.ts'
import { PUBLIC_CACHE_CONTROL, PUBLIC_ROBOTS, findPublication, type Publication } from './publication.ts'

/**
 * The share page's 3D view: the published version's design, so a visitor
 * can turn the garment instead of only seeing its five stills.
 *
 * What a stranger gets is what the stills already show, in a form the
 * renderer can draw:
 *
 * - `GET /public/:slug/scene?seq=` — the published version's document with
 *   hidden layers taken out and layer names and locks dropped (they are
 *   the owner's working notes, not the print). Never the owner, history,
 *   other versions or storage paths.
 * - `GET /public/:slug/asset/:assetId?seq=` — one uploaded image a visible
 *   layer of that version draws, streamed by us (a signed storage URL
 *   would carry the owner ID). Only the exact bytes validated at upload
 *   (sha256), only while published, and only the published version.
 *
 * Both 404 once unpublished or when `seq` is no longer the published
 * version, and nothing is cached, as for the stills (#183).
 */

const ASSET_ID = /^asset_[A-Za-z0-9_-]{8,64}$/
const ASSET_BUCKET = 'design-assets'
const SEQ = /^[1-9][0-9]{0,9}$/

export type PublicScene = {
  seq: number
  /** A canonical document (schema v2): read it with `readCanonicalDocument`. */
  document: unknown
  /** Our URL for each uploaded image the document draws; library art is the client's own. */
  assets: Record<string, string>
}

type Respond = (args: { status: number; body?: unknown }) => Response

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The uploaded image a stored layer draws, if any (`layerAssetId`, on untyped JSON). */
function storedAssetId(layer: Json): string | null {
  if (layer.kind === 'image' && typeof layer.assetId === 'string') {
    return layer.assetId
  }

  if (layer.kind === 'fill' && isRecord(layer.source) && typeof layer.source.assetId === 'string') {
    return layer.source.assetId
  }

  return null
}

/**
 * The stored document as a stranger may see it: only visible layers, without
 * their names or locks, and the uploaded images those layers draw. Anything
 * that isn't a well-formed document gives null (the page keeps its stills).
 */
export function publicSceneDocument({ content }: { content: unknown }): { document: Json; assetIds: string[] } | null {
  if (!isRecord(content) || !isRecord(content.panels)) {
    return null
  }

  const assetIds = new Set<string>()
  const panels: Json = {}

  for (const [panelId, panel] of Object.entries(content.panels)) {
    if (!isRecord(panel) || !Array.isArray(panel.layers)) {
      return null
    }

    const layers = panel.layers.filter((layer): layer is Json => isRecord(layer) && layer.visible === true).map((layer) => {
      // Names and locks are the owner's working notes, not the print.
      const { name: _name, locked: _locked, ...kept } = layer
      const assetId = storedAssetId(kept)

      if (assetId && !assetId.startsWith(LIBRARY_ASSET_PREFIX)) {
        assetIds.add(assetId)
      }

      return kept
    })

    panels[panelId] = { ...panel, layers }
  }

  return { document: { ...content, panels }, assetIds: [...assetIds] }
}

/** Our stable URL for one uploaded image of the published version. */
export function publicAssetPath({ slug, assetId, seq }: { slug: string; assetId: string; seq: number }) {
  return `/api/flp/public/${slug}/asset/${assetId}?seq=${seq}`
}

/** The live publication, when `seq` (if given) is still its published version. */
async function currentPublication({ admin, slug, seq }: { admin: SupabaseClient; slug: string | undefined; seq: string | null }) {
  if (seq !== null && !SEQ.test(seq)) {
    return null
  }

  const published = await findPublication({ admin, slug })
  return published && (seq === null || Number(seq) === published.seq) ? published : null
}

async function publishedContent({ admin, published }: { admin: SupabaseClient; published: Publication }) {
  const { data, error } = await admin
    .from('design_versions')
    .select('content')
    .eq('design_id', published.designId)
    .eq('seq', published.seq)
    .maybeSingle()

  if (error) {
    throw new Error('version read failed', { cause: error })
  }

  return publicSceneDocument({ content: (data as { content?: unknown } | null)?.content })
}

/** GET /public/:slug/scene[?seq=] — the published design, for the share page's 3D view. */
export async function readPublicScene({
  admin,
  slug,
  search,
  respond,
}: {
  admin: SupabaseClient
  slug: string | undefined
  search: URLSearchParams
  respond: Respond
}) {
  const gone = () => respond({ status: 404, body: { error: { code: 'not_found', message: 'This design is not available' } } })

  try {
    const published = await currentPublication({ admin, slug, seq: search.get('seq') })

    if (!published) {
      return gone()
    }

    const scene = await publishedContent({ admin, published })

    if (!scene) {
      return gone()
    }

    const body: PublicScene = {
      seq: published.seq,
      document: scene.document,
      assets: Object.fromEntries(
        scene.assetIds.map((assetId) => [assetId, publicAssetPath({ slug: published.slug, assetId, seq: published.seq })]),
      ),
    }

    return respond({ status: 200, body })
  } catch (error) {
    console.error('flp public scene read failed', { error })
    return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
  }
}

/** GET /public/:slug/asset/:assetId[?seq=] — one image the published version draws. */
export async function readPublicAsset({
  admin,
  slug,
  assetId,
  search,
}: {
  admin: SupabaseClient
  slug: string | undefined
  assetId: string | undefined
  search: URLSearchParams
}) {
  const gone = () =>
    Response.json(
      { error: { code: 'not_found', message: 'This design is not available' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )

  if (!assetId || !ASSET_ID.test(assetId) || assetId.startsWith(LIBRARY_ASSET_PREFIX)) {
    return gone()
  }

  try {
    const published = await currentPublication({ admin, slug, seq: search.get('seq') })

    if (!published) {
      return gone()
    }

    // Only an image a visible layer of the published version draws.
    const scene = await publishedContent({ admin, published })

    if (!scene?.assetIds.includes(assetId)) {
      return gone()
    }

    const [{ data: design, error: designError }, { data: asset, error: assetError }] = await Promise.all([
      admin.from('designs').select('owner_id').eq('id', published.designId).maybeSingle(),
      admin
        .from('assets')
        .select('owner_id, status, mime_type, sha256, storage_path')
        .eq('id', assetId)
        .maybeSingle(),
    ])

    if (designError || assetError) {
      throw new Error('asset read failed', { cause: designError ?? assetError })
    }

    const row = asset as {
      owner_id: string
      status: string
      mime_type: string | null
      sha256: string | null
      storage_path: string | null
    } | null

    // The design's own owner's settled image, never someone else's.
    if (!row || !design || row.owner_id !== (design as { owner_id: string }).owner_id || row.status !== 'ready' || !row.storage_path || !row.sha256) {
      return gone()
    }

    const { data, error } = await admin.storage.from(ASSET_BUCKET).download(row.storage_path)

    if (error || !data) {
      return gone()
    }

    // Only the exact bytes validated at upload are ever served.
    const bytes = await data.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

    if (hex !== row.sha256) {
      console.error('flp public asset hash mismatch', { slug: published.slug })
      return gone()
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': row.mime_type ?? 'image/png',
        'Cache-Control': PUBLIC_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': PUBLIC_ROBOTS,
      },
    })
  } catch (error) {
    console.error('flp public asset read failed', { error })
    return Response.json(
      { error: { code: 'internal', message: 'Something went wrong' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
