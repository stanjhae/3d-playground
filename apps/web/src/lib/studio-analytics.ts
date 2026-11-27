import type { AnalyticsProperties } from './analytics.ts'

/**
 * Studio events and friction signals (docs/analytics.md). Every studio
 * action is a store action, so one wrapper names them all, instead of a
 * call in each button. Properties are catalogue ids and enums only (a
 * garment, a fabric, a step): never a colour, a word, an image or a title.
 */

type Track = (event: { name: string; properties?: AnalyticsProperties }) => void

type Args = Record<string, unknown> | undefined

type Spec = {
  name: string
  /** Picks catalogue ids or enums out of the action's argument. */
  properties?: (args: Args) => AnalyticsProperties
  /** At most one per this many ms (drags, sliders, strokes). */
  throttleMs?: number
  /** Not sent again while its properties are the same as last time (steps, views). */
  dedupe?: boolean
  /** Sent only when this holds for the state before the action runs. */
  when?: (state: Record<string, unknown>) => boolean
}

const pick =
  (from: string, to = from) =>
  (args: Args): AnalyticsProperties => {
    const value = args?.[from]
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? { [to]: value } : {}
  }

/** Store action → event. Anything not listed isn't sent. */
export const STUDIO_ACTION_EVENTS: Record<string, Spec> = {
  // Select
  setGarmentId: { name: 'garment_picked', properties: pick('garmentId', 'garment') },
  setNeck: { name: 'neck_picked', properties: pick('neck') },
  setShape: { name: 'shape_edited', throttleMs: 2000 },
  setStructural: { name: 'shape_edited', throttleMs: 2000 },
  setAvatarId: { name: 'avatar_picked' },
  setAvatarMeasurements: { name: 'avatar_measured', throttleMs: 2000 },
  // Colour, fabric and pattern
  applyFabric: { name: 'fabric_applied', properties: pick('fabricId', 'fabric') },
  setBaseFabric: { name: 'fabric_applied', properties: pick('fabricId', 'fabric') },
  applyBaseColor: { name: 'colour_applied', throttleMs: 1500 },
  setBasePattern: { name: 'pattern_picked', properties: pick('patternId', 'pattern') },
  setBaseFinish: { name: 'finish_picked', properties: pick('finishId', 'finish') },
  addSectionFill: { name: 'section_fill_added' },
  updateFill: { name: 'section_fill_edited', throttleMs: 2000 },
  setSurface: { name: 'surface_picked', properties: pick('surface') },
  // Design tools
  setDesignTool: { name: 'tool_opened', properties: pick('designTool', 'tool') },
  setPaintTool: { name: 'paint_tool_picked', properties: pick('paintTool', 'tool') },
  setPaintColor: { name: 'paint_colour_changed', throttleMs: 1500 },
  startStroke: { name: 'stroke_drawn', throttleMs: 5000 },
  clearInk: { name: 'ink_cleared' },
  addText: { name: 'text_added' },
  setTextFace: { name: 'text_face_picked', properties: pick('textFace', 'face') },
  addGraphic: { name: 'graphic_added' },
  addUploadedImage: { name: 'image_uploaded' },
  addPattern: { name: 'print_added' },
  // Layers
  updateLayer: { name: 'layer_edited', throttleMs: 2000 },
  endLayerEdit: { name: 'layer_transformed', throttleMs: 2000, when: (state) => Boolean(state.activeLayerEdit) },
  removeLayer: { name: 'layer_removed' },
  duplicateLayer: { name: 'layer_duplicated' },
  copyLayerToOpposite: { name: 'layer_mirrored' },
  copyLayer: { name: 'layer_copied' },
  pasteLayer: { name: 'layer_pasted' },
  moveLayer: { name: 'layer_reordered' },
  moveLayerTo: { name: 'layer_reordered' },
  moveLayerToPanel: { name: 'layer_moved_panel', properties: pick('panel') },
  setLayersVisible: { name: 'layer_visibility' },
  // History
  undoLast: { name: 'undo' },
  redoLast: { name: 'redo' },
  restoreMorning: { name: 'version_restored' },
  upgradeTemplate: { name: 'template_upgraded' },
  // Steps and views
  setCreateStep: { name: 'step_viewed', properties: pick('createStep', 'step'), dedupe: true },
  setStudioView: { name: 'view_changed', properties: pick('studioView', 'view'), dedupe: true },
  setCameraPreset: { name: 'camera_preset', properties: pick('cameraPreset', 'preset'), throttleMs: 1000, dedupe: true },
  setMode: { name: 'mode_changed', properties: pick('mode', 'view'), dedupe: true },
  // Pattern (beta)
  enablePattern: { name: 'pattern_beta_enabled' },
  disablePattern: { name: 'pattern_beta_disabled' },
}

export const FRICTION = {
  /** This many undos inside `undoWindowMs` is one `undo_burst`. */
  undoBurst: 3,
  undoWindowMs: 4000,
  /** A tool left this long after opening, with nothing changed, is abandoned. */
  abandonMinMs: 1500,
  /** No input or change for this long on a step is one `step_idle`. */
  idleMs: 60_000,
}

type StoreLike = {
  getState: () => Record<string, unknown>
  setState: (partial: Record<string, unknown>) => void
  subscribe: (listener: (state: Record<string, unknown>, previous: Record<string, unknown>) => void) => () => void
}

type Clock = {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Wraps the store's actions so each sends its event, and watches for
 * friction: undo bursts, a tool opened then left with nothing changed,
 * and a long idle on a step. Returns a function that puts it all back.
 */
export function installStudioAnalytics({
  store,
  track,
  clock = realClock,
  events = STUDIO_ACTION_EVENTS,
}: {
  store: StoreLike
  track: Track
  clock?: Clock
  events?: Record<string, Spec>
}) {
  const state = store.getState()
  const originals: Record<string, unknown> = {}
  const lastSent = new Map<string, number>()
  const lastProperties = new Map<string, string>()
  let undos: number[] = []
  let burstSent = false
  let openTool: { tool: string; at: number; changed: boolean } | null = null
  let idleTimer: unknown = null
  let idleSentFor: string | null = null

  const send = (name: string, properties?: AnalyticsProperties) => track({ name, properties })

  const closeTool = () => {
    if (openTool && !openTool.changed && clock.now() - openTool.at >= FRICTION.abandonMinMs) {
      send('tool_abandoned', { tool: openTool.tool })
    }

    openTool = null
  }

  const step = () => {
    const value = store.getState().createStep
    return typeof value === 'string' ? value : null
  }

  const armIdle = () => {
    clock.clearTimeout(idleTimer)
    idleTimer = clock.setTimeout(() => {
      const current = step()

      if (current && idleSentFor !== current && !(typeof document !== 'undefined' && document.hidden)) {
        idleSentFor = current
        send('step_idle', { step: current, seconds: Math.round(FRICTION.idleMs / 1000) })
      }
    }, FRICTION.idleMs)
  }

  const onUndo = () => {
    const time = clock.now()
    undos = [...undos.filter((at) => time - at < FRICTION.undoWindowMs), time]

    if (undos.length >= FRICTION.undoBurst && !burstSent) {
      burstSent = true
      send('undo_burst', { count: undos.length })
    } else if (undos.length === 1) {
      burstSent = false
    }
  }

  const before: Record<string, (args: Args) => void> = {
    setDesignTool: (args) => {
      closeTool()
      const tool = args?.designTool

      if (typeof tool === 'string') {
        openTool = { tool, at: clock.now(), changed: false }
      }
    },
    setCreateStep: (args) => {
      closeTool()

      if (args?.createStep !== step()) {
        idleSentFor = null
      }
    },
    undoLast: onUndo,
  }

  const wrapped: Record<string, unknown> = {}

  for (const [action, spec] of Object.entries(events)) {
    const original = state[action]

    if (typeof original !== 'function') {
      continue
    }

    originals[action] = original
    wrapped[action] = (...callArgs: unknown[]) => {
      const args = (callArgs[0] && typeof callArgs[0] === 'object' ? callArgs[0] : undefined) as Args

      try {
        const allowed = !spec.when || spec.when(store.getState())
        before[action]?.(args)
        const time = clock.now()
        const previous = lastSent.get(spec.name)
        const properties = spec.properties?.(args)
        const key = JSON.stringify(properties ?? {})
        const repeat = spec.dedupe && lastProperties.get(spec.name) === key

        if (allowed && !repeat && (!spec.throttleMs || previous === undefined || time - previous >= spec.throttleMs)) {
          lastSent.set(spec.name, time)
          lastProperties.set(spec.name, key)
          send(spec.name, properties)
        }
      } catch {
        // Analytics never stops an edit.
      }

      return (original as (...a: unknown[]) => unknown)(...callArgs)
    }
  }

  store.setState(wrapped)

  const unsubscribe = store.subscribe((next, previous) => {
    if (next.document !== previous.document && openTool) {
      openTool.changed = true
    }

    armIdle()
  })

  const onInput = () => armIdle()
  const onHide = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      closeTool()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', onInput, { passive: true })
    window.addEventListener('keydown', onInput, { passive: true })
    document.addEventListener('visibilitychange', onHide)
  }

  armIdle()

  return () => {
    closeTool()
    unsubscribe()
    clock.clearTimeout(idleTimer)
    store.setState(originals)

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', onInput)
      window.removeEventListener('keydown', onInput)
      document.removeEventListener('visibilitychange', onHide)
    }
  }
}

/** Pattern (beta) edits, by kind: the editor's own label never leaves. */
export function patternEditAction({ what }: { what: string }) {
  const rules: Array<[RegExp, string]> = [
    [/^Added point/, 'point_added'],
    [/^Removed point/, 'point_removed'],
    [/^Nudged/, 'point_nudged'],
    [/^Moved cut-out/, 'cutout_moved'],
    [/^Moved /, 'point_moved'],
    [/^Removed cut-out/, 'cutout_removed'],
    [/cut-out|^Added a /i, 'cutout_added'],
    [/^Closed the slit/, 'slit_closed'],
    [/^Slit of/, 'slit_opened'],
    [/^Pattern reset/, 'reset'],
    [/^Pattern set to/, 'preset'],
    [/^Applied the AI suggestion/, 'ai_applied'],
  ]

  return rules.find(([pattern]) => pattern.test(what))?.[1] ?? 'quick_edit'
}

/**
 * Error messages shown to people (`role="alert"`, the site's error
 * notices) as `error_shown` with the route only, never the message: a
 * spike on one route is a place people struggle.
 */
export function watchErrorMessages({
  track,
  root = typeof document === 'undefined' ? null : document.body,
  route = () => (typeof location === 'undefined' ? '/' : location.pathname),
}: {
  track: Track
  root?: Element | null
  route?: () => string
}) {
  if (!root || typeof MutationObserver === 'undefined') {
    return () => {}
  }

  const shown = new WeakMap<Element, string>()

  const check = () => {
    for (const element of root.querySelectorAll('[role="alert"]')) {
      const text = element.textContent?.trim() ?? ''

      if (text && shown.get(element) !== text) {
        shown.set(element, text)
        track({ name: 'error_shown', properties: { route: route() } })
      } else if (!text) {
        shown.delete(element)
      }
    }
  }

  const observer = new MutationObserver(check)
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  check()
  return () => observer.disconnect()
}
