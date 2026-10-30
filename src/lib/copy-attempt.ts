import type { CanonicalDocument } from './canonical-document.ts'
import type { FlpResult } from './flp-api/client.ts'
import type { CreateDesignRequest, VersionResponse } from './flp-api/contract.ts'

/**
 * "Save mine as a copy" without duplicates (S06 #175). One attempt keeps
 * one mutation key and the document as it was on the first click; retries
 * resend exactly that until the server acknowledges, so a lost response
 * or a second click replays the same create instead of making another
 * design. A click while one is in flight joins it.
 */
export function createCopyAttempt({
  create,
  newKey = () => crypto.randomUUID(),
}: {
  create: (request: CreateDesignRequest) => Promise<FlpResult<VersionResponse>>
  newKey?: () => string
}) {
  let pending: CreateDesignRequest | null = null
  let inFlight: Promise<FlpResult<VersionResponse>> | null = null

  function run({ title, content }: { title: string; content: CanonicalDocument }) {
    if (inFlight) {
      return inFlight
    }

    pending ??= { mutationKey: newKey(), title, content }
    const request = pending

    inFlight = create(request)
      .then((result) => {
        // The key is spent once acknowledged; the next copy is a new one.
        if (result.ok && pending === request) {
          pending = null
        }

        return result
      })
      .finally(() => {
        inFlight = null
      })

    return inFlight
  }

  return {
    run,
    busy: () => inFlight !== null,
  }
}

export type CopyAttempt = ReturnType<typeof createCopyAttempt>
