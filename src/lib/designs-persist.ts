import type { Design } from './design-schema'

export const DESIGNS_KV_KEY = 'flv:designs'

export type DesignsPersist = {
  load: () => Promise<Design[] | null>
  save: ({ designs }: { designs: Design[] }) => Promise<void>
}

type KvClient = {
  get: (key: string) => Promise<Design[] | null>
  set: (key: string, value: Design[]) => Promise<unknown>
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

export function createMemoryPersist({
  store,
}: {
  store?: { value: Design[] | null }
} = {}): DesignsPersist {
  const memory = store ?? { value: null }

  return {
    async load() {
      return memory.value ? memory.value.map((design) => ({ ...design })) : null
    },
    async save({ designs }) {
      memory.value = designs.map((design) => ({ ...design }))
    },
  }
}

function parseKvResult({ result }: { result: unknown }): Design[] | null {
  if (result == null) {
    return null
  }

  if (Array.isArray(result)) {
    return result as Design[]
  }

  if (typeof result !== 'string') {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(result)

    return Array.isArray(parsed) ? (parsed as Design[]) : null
  } catch {
    return null
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

      return parseKvResult({ result: body.result })
    },
    async set(key, value) {
      await restCommand({
        url,
        token,
        command: ['SET', key, JSON.stringify(value)],
      })
    },
  }
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
      const kvClient = await resolveClient()
      const value = await kvClient.get(DESIGNS_KV_KEY)

      return Array.isArray(value) ? value : null
    },
    async save({ designs }) {
      const kvClient = await resolveClient()
      await kvClient.set(DESIGNS_KV_KEY, designs)
    },
  }
}

export function createDesignsPersist({
  env,
  memory,
  kvClient,
}: {
  env?: Record<string, string | undefined>
  memory?: { value: Design[] | null }
  kvClient?: KvClient
} = {}): DesignsPersist {
  if (isKvConfigured({ env })) {
    return createKvPersist({ client: kvClient, env })
  }

  return createMemoryPersist({ store: memory })
}
