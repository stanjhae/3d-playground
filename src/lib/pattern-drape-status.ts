import { create } from 'zustand'

/**
 * How the studio's pattern drape is going, for the "Draping…" chip. Kept
 * apart from the solver so the chip doesn't pull the cloth code into the
 * main bundle.
 */
export type DrapeStatus = {
  state: 'idle' | 'draping' | 'ready' | 'failed'
  /** 0 to 1 while draping. */
  progress: number
  /** Drapes the studio has run this session (stored meshes don't count). */
  runs: number
}

export const usePatternDrape = create<DrapeStatus>()(() => ({ state: 'idle', progress: 0, runs: 0 }))

/**
 * Resolves once no drape is running: 'ready' or 'failed' for the last one,
 * 'idle' when the design has no pattern, or 'timeout'. Publishing and stills
 * wait on it, so a photo never shows a garment mid-drape.
 */
export function waitForDrape({ timeoutMs = 30_000 }: { timeoutMs?: number } = {}): Promise<DrapeStatus['state'] | 'timeout'> {
  const settled = (state: DrapeStatus['state']) => state !== 'draping'
  const now = usePatternDrape.getState().state

  if (settled(now)) {
    return Promise.resolve(now)
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe()
      resolve('timeout')
    }, timeoutMs)
    const unsubscribe = usePatternDrape.subscribe((status) => {
      if (settled(status.state)) {
        clearTimeout(timer)
        unsubscribe()
        resolve(status.state)
      }
    })
  })
}
