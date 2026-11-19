import { create } from 'zustand'

import { getPublication } from './flp-api/client'
import type { OwnerPublication } from './flp-api/publication'

/**
 * Whether the open cloud design is published, as the server last said
 * (third outside test pass). Until the answer comes the studio shows
 * neither "Private" nor a Publish button: reloading the publish step of a
 * published design used to offer "Publish publicly" for a while first.
 *
 * The read starts as soon as the design id is known, beside opening the
 * design, instead of after the Publish panel mounts (which waits for the
 * design and the local recovery read).
 */
export type PublicationStatus =
  | { designId: string | null; status: 'unknown' }
  | { designId: string; status: 'known'; publication: OwnerPublication | null }
  | { designId: string; status: 'failed' }

type PublicationStore = {
  current: PublicationStatus
}

export const usePublicationStatus = create<PublicationStore>(() => ({
  current: { designId: null, status: 'unknown' },
}))

let inFlight: { designId: string; promise: Promise<void> } | null = null
// Only the latest read may answer: an older one landing late is dropped.
let latestRead = 0

/**
 * Reads the publication of `designId`. One read per design at a time;
 * `force` re-reads after a publish or unpublish. A read for a design that
 * is no longer current is dropped.
 */
export function loadPublicationStatus({
  designId,
  force = false,
  read = getPublication,
}: {
  designId: string
  force?: boolean
  read?: typeof getPublication
}): Promise<void> {
  const { current } = usePublicationStatus.getState()

  if (current.designId !== designId) {
    usePublicationStatus.setState({ current: { designId, status: 'unknown' } })
  } else if (!force) {
    if (inFlight?.designId === designId) {
      return inFlight.promise
    }

    if (current.status === 'known') {
      return Promise.resolve()
    }
  }

  latestRead += 1
  const readId = latestRead
  const promise = read({ designId }).then((result) => {
    if (readId !== latestRead || usePublicationStatus.getState().current.designId !== designId) {
      return
    }

    usePublicationStatus.setState({
      current: result.ok
        ? { designId, status: 'known', publication: result.data.publication }
        : { designId, status: 'failed' },
    })
  })
  const entry = { designId, promise }
  inFlight = entry
  void promise.finally(() => {
    if (inFlight === entry) {
      inFlight = null
    }
  })

  return promise
}

/** Forget the status (sign-out, or another design opening). */
export function resetPublicationStatus() {
  inFlight = null
  latestRead += 1
  usePublicationStatus.setState({ current: { designId: null, status: 'unknown' } })
}

/** The status for `designId`, `unknown` while another design's is held. */
export function publicationStatusFor({
  current,
  designId,
}: {
  current: PublicationStatus
  designId: string | null
}): PublicationStatus {
  return designId && current.designId === designId ? current : { designId, status: 'unknown' }
}
