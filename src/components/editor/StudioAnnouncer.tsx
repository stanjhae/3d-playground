import { useStudioAnnouncer } from '../../lib/studio-announcer'

export function StudioAnnouncer() {
  const message = useStudioAnnouncer((state) => state.message)
  const serial = useStudioAnnouncer((state) => state.serial)

  return (
    <p role="status" aria-live="polite" className="sr-only">
      {/* Keyed so a repeated message replaces the node and is read again. */}
      <span key={serial}>{message}</span>
    </p>
  )
}
