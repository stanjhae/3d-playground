import { GRAPHIC_IDS } from './graphics-ids.gen.ts'

/**
 * Graphics shipped with the app (public/graphics/<id>.svg) are not uploads: they get stable
 * `asset_lib_<slug>` ids that need no asset row, and their bytes always
 * come from the app bundle. Every other image id must be a finalized
 * upload (S01 #170).
 */

const LIBRARY_PREFIX = 'asset_lib_'

export const LIBRARY_ASSET_SOURCES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(GRAPHIC_IDS.map((id) => [`${LIBRARY_PREFIX}${id}`, `/graphics/${id}.svg`])),
)

const LIBRARY_ID_BY_SOURCE = new Map(
  Object.entries(LIBRARY_ASSET_SOURCES).map(([id, src]) => [src, id]),
)

export function libraryAssetId({ src }: { src: string }) {
  return LIBRARY_ID_BY_SOURCE.get(src) ?? null
}

export function isLibraryAssetId({ assetId }: { assetId: string }) {
  return assetId in LIBRARY_ASSET_SOURCES
}
