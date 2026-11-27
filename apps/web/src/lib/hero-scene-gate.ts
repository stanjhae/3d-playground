import { lgUpSnapshot } from './viewport'

/**
 * When the landing hero swaps its poster for the live 3D tee (P4). The
 * scene's chunk (three.js and the studio stage) is the heaviest thing on the
 * page, so it never sits on the critical path:
 * - no WebGL: the poster stays;
 * - a desktop with a fine pointer: load once the page is idle;
 * - touch, Save-Data or a slow link: load when the visitor touches the hero.
 */
export type HeroSceneTrigger = 'never' | 'idle' | 'interaction'

export function heroSceneTrigger({
  webgl,
  finePointer,
  wide,
  saveData,
  slowNetwork,
}: {
  webgl: boolean
  finePointer: boolean
  wide: boolean
  saveData: boolean
  slowNetwork: boolean
}): HeroSceneTrigger {
  if (!webgl) {
    return 'never'
  }

  if (saveData || slowNetwork) {
    return 'interaction'
  }

  return finePointer && wide ? 'idle' : 'interaction'
}

type NavigatorConnection = { saveData?: boolean; effectiveType?: string }

/** Reads the browser's signals for `heroSceneTrigger`. */
export function readHeroSceneSignals({ webgl }: { webgl: boolean }) {
  const media = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const connection = (navigator as Navigator & { connection?: NavigatorConnection }).connection

  return {
    webgl,
    finePointer: media('(pointer: fine)'),
    wide: lgUpSnapshot(),
    saveData: connection?.saveData === true,
    slowNetwork: /(^|-)2g$/.test(connection?.effectiveType ?? ''),
  }
}

/** Runs `run` when the browser is idle, with a timer where idle callbacks don't exist. */
export function whenIdle({ run, timeout = 2000 }: { run: () => void; timeout?: number }) {
  const idle = (window as Window & { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback

  if (typeof idle === 'function') {
    const handle = idle(run, { timeout })
    return () => window.cancelIdleCallback(handle)
  }

  const handle = window.setTimeout(run, 1200)
  return () => window.clearTimeout(handle)
}
