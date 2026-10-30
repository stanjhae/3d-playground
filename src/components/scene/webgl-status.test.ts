import { beforeEach, describe, expect, it } from 'vitest'

import {
  WEBGL_COPY,
  detectWebgl,
  nextWebglStatus,
  publishBlockedReason,
  useWebglStore,
  webglTestMode,
} from './webgl-status'

describe('nextWebglStatus', () => {
  it('becomes ready once the canvas starts', () => {
    expect(nextWebglStatus({ status: 'checking', event: 'probe-ok' })).toBe('ready')
  })

  it('does not let a late probe hide a loss', () => {
    expect(nextWebglStatus({ status: 'lost', event: 'probe-ok' })).toBe('lost')
  })

  it('goes lost and back to ready on restore', () => {
    const lost = nextWebglStatus({ status: 'ready', event: 'context-lost' })
    expect(lost).toBe('lost')
    expect(nextWebglStatus({ status: lost, event: 'context-restored' })).toBe('ready')
  })

  it('treats a failed probe or canvas as unsupported for good', () => {
    expect(nextWebglStatus({ status: 'checking', event: 'probe-failed' })).toBe('unsupported')
    expect(nextWebglStatus({ status: 'ready', event: 'canvas-failed' })).toBe('unsupported')
    expect(nextWebglStatus({ status: 'unsupported', event: 'context-lost' })).toBe('unsupported')
    expect(nextWebglStatus({ status: 'unsupported', event: 'context-restored' })).toBe(
      'unsupported',
    )
  })

  it('ignores a restore that was not preceded by a loss', () => {
    expect(nextWebglStatus({ status: 'ready', event: 'context-restored' })).toBe('ready')
  })
})

describe('publishBlockedReason', () => {
  it('allows publishing only while the canvas is ready', () => {
    expect(publishBlockedReason({ status: 'ready' })).toBeNull()

    for (const status of ['checking', 'lost'] as const) {
      expect(publishBlockedReason({ status })).toBe(WEBGL_COPY.publishBlocked)
    }
  })

  it('tells a browser without WebGL to publish from elsewhere', () => {
    expect(publishBlockedReason({ status: 'unsupported' })).toBe(WEBGL_COPY.publishUnsupported)
  })
})

describe('detectWebgl', () => {
  it('accepts WebGL2 and frees the probe context', () => {
    let freed = false
    const context = {
      getExtension: () => ({
        loseContext: () => {
          freed = true
        },
      }),
    }

    expect(
      detectWebgl({
        createCanvas: () => ({
          getContext: (kind) => (kind === 'webgl2' ? context : null),
        }),
      }),
    ).toBe(true)
    expect(freed).toBe(true)
  })

  it('falls back to WebGL1', () => {
    expect(
      detectWebgl({
        createCanvas: () => ({
          getContext: (kind) => (kind === 'webgl' ? {} : null),
        }),
      }),
    ).toBe(true)
  })

  it('reports missing WebGL, including a throwing canvas', () => {
    expect(detectWebgl({ createCanvas: () => ({ getContext: () => null }) })).toBe(false)
    expect(detectWebgl({ createCanvas: () => null })).toBe(false)
    expect(
      detectWebgl({
        createCanvas: () => ({
          getContext: () => {
            throw new Error('blocked')
          },
        }),
      }),
    ).toBe(false)
  })
})

describe('webglTestMode', () => {
  it('reads the dev-only query flag', () => {
    expect(webglTestMode({ search: '?webgl=lost', dev: true })).toBe('lost')
    expect(webglTestMode({ search: '?step=design&webgl=none', dev: true })).toBe('none')
    expect(webglTestMode({ search: '?webgl=maybe', dev: true })).toBeNull()
  })

  it('is ignored in production builds', () => {
    expect(webglTestMode({ search: '?webgl=lost', dev: false })).toBeNull()
  })
})

describe('useWebglStore', () => {
  beforeEach(() => {
    useWebglStore.setState({ status: 'checking', generation: 0 })
  })

  it('remounts the canvas after a restore', () => {
    const { dispatch } = useWebglStore.getState()
    dispatch('probe-ok')
    dispatch('context-lost')
    expect(useWebglStore.getState()).toMatchObject({ status: 'lost', generation: 0 })

    dispatch('context-restored')
    expect(useWebglStore.getState()).toMatchObject({ status: 'ready', generation: 1 })

    // A duplicate restore event does not remount again.
    dispatch('context-restored')
    expect(useWebglStore.getState().generation).toBe(1)
  })

  it('retries by hand after a loss the browser never restores', () => {
    const { dispatch, retry } = useWebglStore.getState()
    dispatch('probe-ok')
    dispatch('context-lost')
    retry()
    expect(useWebglStore.getState()).toMatchObject({ status: 'checking', generation: 1 })

    dispatch('probe-ok')
    expect(useWebglStore.getState().status).toBe('ready')
  })
})
