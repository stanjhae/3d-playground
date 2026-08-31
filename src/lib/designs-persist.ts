import type { Design } from './design-schema'

export const DESIGNS_KV_KEY = 'flv:designs'

export type DesignsPersist = {
  load: () => Promise<Design[] | null>
  save: ({ designs }: { designs: Design[] }) => Promise<void>
}

export function isKvConfigured({
  env,
}: {
  env?: Record<string, string | undefined>
} = {}) {
  const source =
    env ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ??
    {}

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

export function createKvPersist({
  client,
}: {
  client?: {
    get: (key: string) => Promise<Design[] | null>
    set: (key: string, value: Design[]) => Promise<unknown>
  }
} = {}): DesignsPersist {
  async function resolveClient() {
    if (client) {
      return client
    }

    const { kv } = await import('@vercel/kv')

    return {
      get: async (key: string) => {
        const value = await kv.get<Design[]>(key)
        return Array.isArray(value) ? value : null
      },
      set: async (key: string, value: Design[]) => kv.set(key, value),
    }
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
  kvClient?: {
    get: (key: string) => Promise<Design[] | null>
    set: (key: string, value: Design[]) => Promise<unknown>
  }
} = {}): DesignsPersist {
  if (isKvConfigured({ env })) {
    return createKvPersist({ client: kvClient })
  }

  return createMemoryPersist({ store: memory })
}
