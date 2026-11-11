import { isKvConfigured } from './designs-persist.ts'

export const WAITLIST_KV_KEY = 'flv:waitlist'
export const EVENTS_KV_KEY = 'flv:assumptions'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function envSource({
  env,
}: {
  env?: Record<string, string | undefined>
} = {}) {
  return (
    env ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ??
    {}
  )
}

async function restCommand({
  url,
  token,
  command,
}: {
  url: string
  token: string
  command: unknown[]
}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })

  if (!response.ok) {
    throw new Error('The list could not be reached')
  }

  return (await response.json()) as { result?: unknown }
}

function memory() {
  const root = globalThis as {
    __flvWaitlist?: string[]
    __flvEvents?: Record<string, number>
  }
  root.__flvWaitlist ??= []
  root.__flvEvents ??= {}
  return root
}

function parseJsonValue({ result }: { result: unknown }): unknown {
  if (typeof result !== 'string') {
    return result
  }

  try {
    return JSON.parse(result)
  } catch {
    return null
  }
}

export function parseStoredList({ result }: { result: unknown }): string[] {
  const parsed = parseJsonValue({ result })

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.filter((entry): entry is string => typeof entry === 'string')
}

export function parseStoredCounts({
  result,
}: {
  result: unknown
}): Record<string, number> {
  const parsed = parseJsonValue({ result })

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  const counts: Record<string, number> = {}

  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      counts[name] = Math.max(0, Math.floor(value))
    }
  }

  return counts
}

let persistTail: Promise<void> = Promise.resolve()

async function withWaitlistLock<T>({
  run,
}: {
  run: () => Promise<T>
}): Promise<T> {
  let release = () => {}
  const previous = persistTail
  persistTail = new Promise<void>((resolve) => {
    release = () => {
      resolve()
    }
  })
  await previous

  try {
    return await run()
  } finally {
    release()
  }
}

export function resetWaitlistStore() {
  const store = memory()
  store.__flvWaitlist = []
  store.__flvEvents = {}
  persistTail = Promise.resolve()
}

export function parseWaitlistEmail({ value }: { value: unknown }) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!EMAIL_PATTERN.test(email) || email.length > 120) {
    return null
  }

  return email
}

export async function addWaitlistEmail({
  email,
  env,
}: {
  email: string
  env?: Record<string, string | undefined>
}) {
  const parsed = parseWaitlistEmail({ value: email })

  if (!parsed) {
    return { ok: false as const }
  }

  return withWaitlistLock({
    run: async () => {
      if (isKvConfigured({ env })) {
        const source = envSource({ env })
        const raw = await restCommand({
          url: source.KV_REST_API_URL ?? '',
          token: source.KV_REST_API_TOKEN ?? '',
          command: ['GET', WAITLIST_KV_KEY],
        })
        const current = parseStoredList({ result: raw.result })
        const next = current.includes(parsed) ? current : [...current, parsed]
        await restCommand({
          url: source.KV_REST_API_URL ?? '',
          token: source.KV_REST_API_TOKEN ?? '',
          command: ['SET', WAITLIST_KV_KEY, JSON.stringify(next)],
        })
        return { ok: true as const, count: next.length }
      }

      const store = memory()
      if (!store.__flvWaitlist?.includes(parsed)) {
        store.__flvWaitlist?.push(parsed)
      }

      return { ok: true as const, count: store.__flvWaitlist?.length ?? 0 }
    },
  })
}

/**
 * Takes one address off the waitlist (Q10 #195), for a person who asks to
 * leave it. `dryRun` only reports whether it is there. Like adding, this
 * reads and rewrites the whole list; a sign-up landing in the same moment
 * from another server could be lost, so check `count` afterwards.
 */
export async function removeWaitlistEmail({
  email,
  env,
  dryRun = false,
}: {
  email: string
  env?: Record<string, string | undefined>
  dryRun?: boolean
}) {
  const parsed = parseWaitlistEmail({ value: email })

  if (!parsed) {
    return { ok: false as const }
  }

  return withWaitlistLock({
    run: async () => {
      if (isKvConfigured({ env })) {
        const source = envSource({ env })
        const kv = { url: source.KV_REST_API_URL ?? '', token: source.KV_REST_API_TOKEN ?? '' }
        const current = parseStoredList({ result: (await restCommand({ ...kv, command: ['GET', WAITLIST_KV_KEY] })).result })
        const next = current.filter((entry) => entry !== parsed)
        const found = next.length !== current.length

        if (found && !dryRun) {
          await restCommand({ ...kv, command: ['SET', WAITLIST_KV_KEY, JSON.stringify(next)] })
        }

        return { ok: true as const, found, count: dryRun ? current.length : next.length }
      }

      const store = memory()
      const current = store.__flvWaitlist ?? []
      const found = current.includes(parsed)

      if (found && !dryRun) {
        store.__flvWaitlist = current.filter((entry) => entry !== parsed)
      }

      return { ok: true as const, found, count: store.__flvWaitlist?.length ?? 0 }
    },
  })
}

export async function incrementAssumption({
  name,
  env,
}: {
  name: string
  env?: Record<string, string | undefined>
}) {
  return withWaitlistLock({
    run: async () => {
      if (isKvConfigured({ env })) {
        const source = envSource({ env })
        const raw = await restCommand({
          url: source.KV_REST_API_URL ?? '',
          token: source.KV_REST_API_TOKEN ?? '',
          command: ['GET', EVENTS_KV_KEY],
        })
        const current = parseStoredCounts({ result: raw.result })
        const next = {
          ...current,
          [name]: (current[name] ?? 0) + 1,
        }
        await restCommand({
          url: source.KV_REST_API_URL ?? '',
          token: source.KV_REST_API_TOKEN ?? '',
          command: ['SET', EVENTS_KV_KEY, JSON.stringify(next)],
        })
        return next
      }

      const store = memory()
      store.__flvEvents = {
        ...store.__flvEvents,
        [name]: (store.__flvEvents?.[name] ?? 0) + 1,
      }
      return store.__flvEvents
    },
  })
}

export function listAssumptionCounts() {
  return { ...(memory().__flvEvents ?? {}) }
}
