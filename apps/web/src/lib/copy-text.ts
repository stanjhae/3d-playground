import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copies to the clipboard and says whether it worked. Browsers refuse when
 * permission is denied or the page isn't secure, and some have no clipboard
 * at all, so callers must be able to tell the person.
 */
export async function copyText({
  text,
  clipboard = globalThis.navigator?.clipboard,
}: {
  text: string
  clipboard?: Pick<Clipboard, 'writeText'>
}) {
  if (!clipboard) {
    return false
  }

  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export type CopyStatus = 'idle' | 'copied' | 'failed'

const COPIED_MS = 2500

/** `copied` fades back to idle; `failed` stays until the next try, so it can be read. */
export function useCopyStatus() {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback(async (text: string) => {
    window.clearTimeout(timer.current)
    const copied = await copyText({ text })
    setStatus(copied ? 'copied' : 'failed')

    if (copied) {
      timer.current = window.setTimeout(() => setStatus('idle'), COPIED_MS)
    }
  }, [])

  return { status, copy }
}
