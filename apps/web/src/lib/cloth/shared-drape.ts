import { type DrapeClient, createDrapeClient } from './cloth-client.ts'

let client: DrapeClient | null = null

/** One cloth worker for the whole studio, so a new drape cancels a stale one. */
export function sharedDrapeClient() {
  client ??= createDrapeClient()
  return client
}
