import { GRAPHIC_ASSETS } from './graphics-library.ts'

/**
 * Graphics shipped with the app are not uploads: they get stable
 * `asset_lib_<slug>` ids that need no asset row, and their bytes always
 * come from the app bundle. Every other image id must be a finalized
 * upload (S01 #170).
 */

const LIBRARY_PREFIX = 'asset_lib_'

export const LIBRARY_ASSET_SOURCES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(GRAPHIC_ASSETS.map((asset) => [`${LIBRARY_PREFIX}${asset.id}`, asset.src])),
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
