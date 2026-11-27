import { describe, expect, test } from 'vitest'

import { FRICTION, STUDIO_ACTION_EVENTS, installStudioAnalytics, patternEditAction } from './studio-analytics'

type State = Record<string, unknown>

function fakeStore(initial: State) {
  let state = initial
  const listeners = new Set<(next: State, previous: State) => void>()
  return {
    getState: () => state,
    setState: (partial: State) => {
      const previous = state
      state = { ...state, ...partial }
      for (const listener of listeners) listener(state, previous)
    },
    subscribe: (listener: (next: State, previous: State) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function fakeClock() {
  let time = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  let next = 1
  return {
    now: () => time,
    setTimeout: (callback: () => void, ms: number) => {
      timers.set(next, { at: time + ms, callback })
      return next++
    },
    clearTimeout: (handle: unknown) => void timers.delete(handle as number),
    advance(ms: number) {
      time += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(id)
          timer.callback()
        }
      }
    },
  }
}

function setup() {
  const sent: Array<{ name: string; properties?: Record<string, unknown> }> = []
  const clock = fakeClock()
  const calls: string[] = []
  const ref: { store?: ReturnType<typeof fakeStore> } = {}
  const action = (name: string, edit = false) => (args?: Record<string, unknown>) => {
    const store = ref.store!
    calls.push(name)
    if (name === 'setCreateStep') store.setState({ createStep: args?.createStep })
    if (edit) store.setState({ document: {} })
  }
  const store = fakeStore({
    document: {},
    createStep: 'select',
    setGarmentId: action('setGarmentId'),
    setDesignTool: action('setDesignTool'),
    setCreateStep: action('setCreateStep'),
    addText: action('addText', true),
    undoLast: action('undoLast', true),
    applyBaseColor: action('applyBaseColor', true),
    setPaintColor: action('setPaintColor'),
    endLayerEdit: action('endLayerEdit'),
  })
  ref.store = store
  const uninstall = installStudioAnalytics({ store, track: (event) => void sent.push(event), clock })
  const run = (name: string, args?: Record<string, unknown>) => (store.getState()[name] as (a?: unknown) => void)(args)
  return { sent, clock, calls, store, run, uninstall }
}

describe('studio events', () => {
  test('each action sends its event, then runs as before', () => {
    const { sent, calls, run } = setup()
    run('setGarmentId', { garmentId: 'tee' })
    run('addText', { content: 'Secret words', face: 'serif' })
    expect(calls).toEqual(['setGarmentId', 'addText'])
    expect(sent).toEqual([
      { name: 'garment_picked', properties: { garment: 'tee' } },
      { name: 'text_added', properties: undefined },
    ])
  })

  test('never sends a colour or the text itself', () => {
    const { sent, run } = setup()
    run('applyBaseColor', { color: '#ff0000' })
    run('setPaintColor', { paintColor: '#00ff00' })
    expect(JSON.stringify(sent)).not.toMatch(/#ff0000|#00ff00/)
    for (const spec of Object.values(STUDIO_ACTION_EVENTS)) {
      expect(JSON.stringify(spec.properties?.({ content: 'Secret', color: '#123456', title: 'Mine' }) ?? {})).toBe('{}')
    }
  })

  test('a step is not sent twice in a row, and a layer edit only when one was going on', () => {
    const { sent, run, store } = setup()
    run('setCreateStep', { createStep: 'color' })
    run('setCreateStep', { createStep: 'color' })
    run('setCreateStep', { createStep: 'design' })
    expect(sent.filter(({ name }) => name === 'step_viewed').map(({ properties }) => properties?.step)).toEqual(['color', 'design'])

    run('endLayerEdit')
    store.setState({ activeLayerEdit: { layerId: 'a' } })
    run('endLayerEdit')
    expect(sent.filter(({ name }) => name === 'layer_transformed')).toHaveLength(1)
  })

    test('busy actions are throttled', () => {
    const { sent, clock, run } = setup()
    run('setPaintColor', { paintColor: '#000' })
    run('setPaintColor', { paintColor: '#111' })
    clock.advance(2000)
    run('setPaintColor', { paintColor: '#222' })
    expect(sent.filter(({ name }) => name === 'paint_colour_changed')).toHaveLength(2)
  })

  test('uninstalling puts the original actions back', () => {
    const { store, uninstall } = setup()
    const wrapped = store.getState().addText
    uninstall()
    expect(store.getState().addText).not.toBe(wrapped)
  })
})

describe('friction signals', () => {
  test('three undos inside the window is one undo_burst', () => {
    const { sent, clock, run } = setup()
    run('undoLast')
    clock.advance(500)
    run('undoLast')
    clock.advance(500)
    run('undoLast')
    run('undoLast')
    expect(sent.filter(({ name }) => name === 'undo_burst')).toEqual([{ name: 'undo_burst', properties: { count: FRICTION.undoBurst } }])
  })

  test('slow undos are not a burst', () => {
    const { sent, clock, run } = setup()
    for (let i = 0; i < 4; i++) {
      run('undoLast')
      clock.advance(FRICTION.undoWindowMs)
    }
    expect(sent.some(({ name }) => name === 'undo_burst')).toBe(false)
  })

  test('a tool opened and left with nothing changed is abandoned', () => {
    const { sent, clock, run } = setup()
    run('setDesignTool', { designTool: 'graphics' })
    clock.advance(FRICTION.abandonMinMs)
    run('setDesignTool', { designTool: 'text' })
    run('addText', {})
    clock.advance(FRICTION.abandonMinMs)
    run('setCreateStep', { createStep: 'share' })
    expect(sent.filter(({ name }) => name === 'tool_abandoned')).toEqual([{ name: 'tool_abandoned', properties: { tool: 'graphics' } }])
  })

  test('a long idle on a step is sent once per step', () => {
    const { sent, clock, run } = setup()
    clock.advance(FRICTION.idleMs)
    clock.advance(FRICTION.idleMs)
    run('setCreateStep', { createStep: 'color' })
    clock.advance(FRICTION.idleMs)
    expect(sent.filter(({ name }) => name === 'step_idle')).toEqual([
      { name: 'step_idle', properties: { step: 'select', seconds: 60 } },
      { name: 'step_idle', properties: { step: 'color', seconds: 60 } },
    ])
  })
})

describe('patternEditAction', () => {
  test('names each edit without its label', () => {
    expect(patternEditAction({ what: 'Added point p7 on Front' })).toBe('point_added')
    expect(patternEditAction({ what: 'Removed cut-out 2 from Back' })).toBe('cutout_removed')
    expect(patternEditAction({ what: 'Added a circle cut-out, 2.0 by 2.0 cm, to Front' })).toBe('cutout_added')
    expect(patternEditAction({ what: 'Moved cut-out 1 on Front' })).toBe('cutout_moved')
    expect(patternEditAction({ what: 'Moved p3 on Front' })).toBe('point_moved')
    expect(patternEditAction({ what: 'Slit of 2.0 cm in seam s1' })).toBe('slit_opened')
    expect(patternEditAction({ what: 'Pattern set to cropped' })).toBe('preset')
    expect(patternEditAction({ what: 'Sleeve length +10 mm' })).toBe('quick_edit')
  })
})
