import type { Design } from './design-schema.ts'

export const DESIGNS_KV_KEY = 'flv:designs'

export type PersistLoadResult =
  | { status: 'missing' }
  | { status: 'ok'; designs: Design[]; revision: number }
  | { status: 'error' }

export type DesignsPersist = {
  load: () => Promise<PersistLoadResult>
  save: ({
    designs,
    revision,
  }: {
    designs: Design[]
    revision: number
  }) => Promise<void>
}

type KvClient = {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: string) => Promise<unknown>
}

type BoardRecord = {
  revision: number
  designs: Design[]
}

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

export function isKvConfigured({
  env,
}: {
  env?: Record<string, string | undefined>
} = {}) {
  const source = envSource({ env })

  return Boolean(source.KV_REST_API_URL && source.KV_REST_API_TOKEN)
}

export function parseBoardResult({
  result,
}: {
  result: unknown
}): PersistLoadResult {
  if (result == null) {
    return { status: 'missing' }
  }

  let parsed: unknown = result

  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result)
    } catch {
      return { status: 'error' }
    }
  }

  if (Array.isArray(parsed)) {
    return { status: 'ok', designs: parsed as Design[], revision: 0 }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'error' }
  }

  const record = parsed as { designs?: unknown; revision?: unknown }

  if (!Array.isArray(record.designs)) {
    return { status: 'error' }
  }

  return {
    status: 'ok',
    designs: record.designs as Design[],
    revision: typeof record.revision === 'number' ? record.revision : 0,
  }
}

export function createMemoryPersist({
  store,
}: {
  store?: { value: Design[] | null; revision?: number }
} = {}): DesignsPersist {
  const memory = store ?? { value: null, revision: 0 }

  return {
    async load() {
      if (memory.value == null) {
        return { status: 'missing' }
      }

      return {
        status: 'ok',
        designs: memory.value.map((design) => ({ ...design })),
        revision: memory.revision ?? 0,
      }
    },
    async save({ designs, revision }) {
      memory.value = designs.map((design) => ({ ...design }))
      memory.revision = revision
    },
  }
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
    throw new Error('The board could not be reached')
  }

  return (await response.json()) as { result?: unknown }
}

function createRestKvClient({
  env,
}: {
  env?: Record<string, string | undefined>
}): KvClient {
  const source = envSource({ env })
  const url = source.KV_REST_API_URL ?? ''
  const token = source.KV_REST_API_TOKEN ?? ''

  return {
    async get(key) {
      const body = await restCommand({
        url,
        token,
        command: ['GET', key],
      })

      return body.result
    },
    async set(key, value) {
      await restCommand({
        url,
        token,
        command: ['SET', key, value],
      })
    },
  }
}

function encodeBoard({
  designs,
  revision,
}: {
  designs: Design[]
  revision: number
}) {
  const record: BoardRecord = { revision, designs }

  return JSON.stringify(record)
}

export function createKvPersist({
  client,
  env,
}: {
  client?: KvClient
  env?: Record<string, string | undefined>
} = {}): DesignsPersist {
  async function resolveClient() {
    return client ?? createRestKvClient({ env })
  }

  return {
    async load() {
      try {
        const kvClient = await resolveClient()
        const result = await kvClient.get(DESIGNS_KV_KEY)

        return parseBoardResult({ result })
      } catch {
        return { status: 'error' }
      }
    },
    async save({ designs, revision }) {
      const kvClient = await resolveClient()
      await kvClient.set(DESIGNS_KV_KEY, encodeBoard({ designs, revision }))
    },
  }
}

export function createDesignsPersist({
  env,
  memory,
  kvClient,
}: {
  env?: Record<string, string | undefined>
  memory?: { value: Design[] | null; revision?: number }
  kvClient?: KvClient
} = {}): DesignsPersist {
  if (isKvConfigured({ env })) {
    return createKvPersist({ client: kvClient, env })
  }

  return createMemoryPersist({ store: memory })
}
