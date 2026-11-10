import { indexedDbRecoveryStorage, recoveryPrefix, type RecoveryStorage } from './cloud-recovery.ts'
import { snapshotStorageKey } from './design-snapshots.ts'

/**
 * After an account is deleted (P1), this browser forgets what it kept for
 * that account: its snapshots (`flv:draft:mornings:<id>`) and its unsaved
 * cloud recovery entries. Best effort: storage that is blocked or full
 * holds nothing to remove, and nothing here reaches the server.
 */
export async function forgetAccountLocally({
  ownerId,
  storage = typeof window === 'undefined' ? null : window.localStorage,
  recovery = indexedDbRecoveryStorage,
}: {
  ownerId: string
  storage?: Pick<Storage, 'removeItem'> | null
  recovery?: Pick<RecoveryStorage, 'keys' | 'delete'>
}) {
  try {
    storage?.removeItem(snapshotStorageKey({ ownerId }))
  } catch {
    // Blocked storage keeps nothing.
  }

  try {
    const keys = await recovery.keys(recoveryPrefix({ ownerId }))
    await Promise.all(keys.map((key) => recovery.delete(key)))
  } catch {
    // No IndexedDB, or it is blocked: nothing was kept there.
  }
}
