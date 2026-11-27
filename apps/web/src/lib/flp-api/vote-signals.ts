import type { SupabaseClient } from '@supabase/supabase-js'

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const VOTE_BURST_LIMIT = 8
export const SHARED_DEVICE_ACCOUNTS = 3
const BURST_MS = 10 * 60_000

export type SignalFlag = 'shared-device' | 'vote-burst'

/** A stable token for the device id. The id itself is not stored. */
export async function deviceToken({ deviceId, secret }: { deviceId: string; secret: string }) {
  if (!DEVICE_ID.test(deviceId) || secret.length === 0) {
    return null
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}\n${deviceId}`))
  return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Which signs this vote raises. Empty means nothing to log. */
export function signalFlags({
  deviceAccounts,
  recentVotes,
}: {
  deviceAccounts: number
  recentVotes: number
}): SignalFlag[] {
  const flags: SignalFlag[] = []

  if (deviceAccounts >= SHARED_DEVICE_ACCOUNTS) {
    flags.push('shared-device')
  }

  if (recentVotes >= VOTE_BURST_LIMIT) {
    flags.push('vote-burst')
  }

  return flags
}

/**
 * Stores the device token for this vote and writes an audit row when the
 * device is shared or the account is voting in a burst. A failure here
 * must not fail the vote; the caller catches it.
 */
export async function recordVoteSignal({
  admin,
  slug,
  voterId,
  deviceId,
  secret,
  now = new Date(),
}: {
  admin: SupabaseClient
  slug: string
  voterId: string
  deviceId: string | null
  secret: string
  now?: Date
}) {
  const token = deviceId ? await deviceToken({ deviceId, secret }) : null

  const saved = await admin.from('vote_signals').upsert(
    { slug, voter_id: voterId, device_token: token, created_at: now.toISOString() },
    { onConflict: 'slug,voter_id' },
  )

  if (saved.error) {
    throw saved.error
  }

  let deviceAccounts = 0

  if (token) {
    const rows = await admin.from('vote_signals').select('voter_id').eq('device_token', token)

    if (rows.error) {
      throw rows.error
    }

    deviceAccounts = new Set((rows.data ?? []).map((row) => row.voter_id)).size
  }

  const since = new Date(now.getTime() - BURST_MS).toISOString()
  const recent = await admin
    .from('publication_votes')
    .select('slug', { count: 'exact', head: true })
    .eq('voter_id', voterId)
    .gte('created_at', since)

  if (recent.error) {
    throw recent.error
  }

  const flags = signalFlags({ deviceAccounts, recentVotes: recent.count ?? 0 })

  if (flags.length === 0) {
    return flags
  }

  const logged = await admin.from('vote_audit').upsert(
    flags.map((flag) => ({
      slug,
      voter_id: voterId,
      flag,
      detail: flag === 'shared-device' ? `${deviceAccounts} accounts on one device` : `${recent.count ?? 0} votes in 10 minutes`,
      created_at: now.toISOString(),
    })),
    { onConflict: 'slug,voter_id,flag' },
  )

  if (logged.error) {
    throw logged.error
  }

  return flags
}
