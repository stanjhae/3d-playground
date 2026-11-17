import { useStudioAnnouncer } from '../../lib/studio-announcer'

export function StudioAnnouncer() {
  const message = useStudioAnnouncer((state) => state.message)
  const serial = useStudioAnnouncer((state) => state.serial)
  const notice = useStudioAnnouncer((state) => state.notice)

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {/* Keyed so a repeated message replaces the node and is read again. */}
        <span key={serial}>{message}</span>
      </p>
      {notice ? (
        // Read through the live region above; these are the same words on screen.
        <p
          aria-hidden
          data-studio-notice=""
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-flv-line bg-white/95 px-4 py-2 font-body text-sm text-flv-ink shadow-md"
        >
          {notice}
        </p>
      ) : null}
    </>
  )
}
