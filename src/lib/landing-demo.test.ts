import { describe, expect, test } from 'vitest'

import { createEmptyDocument } from './design-document'
import {
  addLandingStroke,
  applyLandingPattern,
  cameraViewAzimuth,
  colorWithOpacity,
  garmentCategory,
  LANDING_CAMERA_POSITIONS,
  LANDING_PANEL_ASPECT,
  LANDING_SCALE_STEP,
  LANDING_VIEW_PANEL,
  padToPanel,
  padToSketch,
  landingClothOverrides,
  latestLandingGraphicId,
  listGarmentsByCategory,
  pickCannedStillGrid,
  removeLandingGraphic,
  scaleLandingGraphic,
  resolveLandingStrokeTool,
  sampleSizeMeasurements,
  stampLandingGraphic,
  studioEnvAppearance,
  studioStageBackdrop,
  updateLandingGraphicTransform,
  videoStillForScene,
  CANNED_STILLS,
  SHOOT_PRESETS,
  VIDEO_SCENES,
} from './landing-demo'
import { resolveTemplate } from './template-manifest'
import { useLandingDemoStore } from './landing-demo-store'
import { landingPanelRoutes, landingRenderDocument, toSketchPoint, withLandingOverlays } from './landing-real-tee'

describe('landing-demo', () => {
  test('maps garments into marketing categories', () => {
    expect(garmentCategory({ garmentId: 'tee' })).toBe('tops')
    expect(garmentCategory({ garmentId: 'coat' })).toBe('outerwear')
    expect(listGarmentsByCategory({ category: 'tops' }).length).toBeGreaterThan(
      0,
    )
    expect(listGarmentsByCategory({ category: 'bottoms' }).map((garment) => garment.id)).toEqual(['trousers'])
    expect(listGarmentsByCategory({ category: 'accessories' })).toEqual([])
  })

  test('picks a stable canned still grid from a seed', () => {
    const first = pickCannedStillGrid({ seed: 'streetwear', count: 4 })
    const second = pickCannedStillGrid({ seed: 'streetwear', count: 4 })
    expect(first).toEqual(second)
    expect(first).toHaveLength(4)
    expect(
      first.every((src) =>
        CANNED_STILLS.includes(src as (typeof CANNED_STILLS)[number]),
      ),
    ).toBe(true)
  })

  test('maps video scenes onto canned stills', () => {
    expect(VIDEO_SCENES.length).toBeGreaterThan(0)
    expect(SHOOT_PRESETS.some((preset) => preset.id === 'streetwear')).toBe(
      true,
    )
    expect(videoStillForScene({ sceneId: 'front' })).toMatch(/^\/stills\//)
  })

  test('stamps and transforms landing graphics', () => {
    const empty = createEmptyDocument({ garmentId: 'tee' })
    const stamped = stampLandingGraphic({
      document: empty,
      src: '/graphics/cross-simple.svg',
      x: 0.4,
      y: 0.35,
      scale: 0.22,
    })
    const layerId = latestLandingGraphicId({ document: stamped })
    expect(layerId).toBeTruthy()
    const moved = updateLandingGraphicTransform({
      document: stamped,
      layerId: layerId!,
      x: 0.6,
      y: 0.55,
      scale: 0.4,
    })
    const layer = moved.layers.find((entry) => entry.id === layerId)
    expect(layer?.kind).toBe('graphic')
    if (layer?.kind === 'graphic') {
      expect(layer.x).toBe(0.6)
      expect(layer.y).toBe(0.55)
      expect(layer.scale).toBe(0.4)
    }
  })

  test('adds landing strokes and pattern layers', () => {
    const empty = createEmptyDocument({ garmentId: 'tee' })
    const inked = addLandingStroke({
      document: empty,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.45 },
      ],
      color: '#111111',
      width: 0.04,
    })
    const paint = inked.layers.find((layer) => layer.kind === 'paint')
    expect(paint?.kind).toBe('paint')
    if (paint?.kind === 'paint') {
      expect(paint.strokes).toHaveLength(1)
    }

    const patterned = applyLandingPattern({
      document: inked,
      patternId: 'stripe',
      color: '#ff6a3d',
    })
    expect(patterned.layers.some((layer) => layer.kind === 'pattern')).toBe(
      true,
    )

    const cleared = applyLandingPattern({
      document: patterned,
      patternId: 'solid',
      color: '#ff6a3d',
    })
    expect(cleared.layers.some((layer) => layer.kind === 'pattern')).toBe(false)
  })

  test('maps camera views to azimuth and known seats', () => {
    expect(cameraViewAzimuth({ view: 'front' })).toBe(0)
    expect(cameraViewAzimuth({ view: 'back' })).toBe(Math.PI)
    // The wearer's sides: Left looks at the left sleeve, at +x.
    expect(cameraViewAzimuth({ view: 'left' })).toBe(Math.PI / 2)
    expect(cameraViewAzimuth({ view: 'right' })).toBe(-Math.PI / 2)
    expect(LANDING_CAMERA_POSITIONS.left[0]).toBeGreaterThan(0)
    expect(LANDING_CAMERA_POSITIONS.right[0]).toBeLessThan(0)
    expect(LANDING_CAMERA_POSITIONS.front[2]).toBeGreaterThan(0)
    expect(LANDING_CAMERA_POSITIONS.back[2]).toBeLessThan(0)
  })

  test('maps sample sizes to avatar measurements', () => {
    const xs = sampleSizeMeasurements({ size: 'XS' })
    const xl = sampleSizeMeasurements({ size: 'XL' })
    expect(xs.height).toBeLessThan(xl.height)
    expect(xs.chest).toBeLessThan(xl.chest)
    expect(sampleSizeMeasurements({ size: 'L' }).height).toBe(180)
  })

  test('returns distinct studio and outdoor env appearance', () => {
    const studio = studioEnvAppearance({ envMode: 'studio' })
    const outdoor = studioEnvAppearance({ envMode: 'outdoor' })
    expect(studio.background).not.toBe(outdoor.background)
    expect(outdoor.environmentIntensity).toBeGreaterThan(
      studio.environmentIntensity,
    )
    expect(outdoor.keyIntensity).toBeGreaterThan(studio.keyIntensity)
  })

  test('the studio is a white backdrop that darkens a touch downward, as in the mockups', () => {
    const luma = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16)
      return (value >> 16) * 0.3 + ((value >> 8) & 255) * 0.59 + (value & 255) * 0.11
    }
    const { background, backgroundLow } = studioEnvAppearance({ envMode: 'studio' })

    expect(background).toBe('#ffffff')
    expect(luma(backgroundLow)).toBeLessThan(luma(background))
    expect(luma(backgroundLow)).toBeGreaterThan(225)
    expect(studioStageBackdrop()).toContain(background)
    expect(studioStageBackdrop()).toContain(backgroundLow)
  })

  test('maps Fill to a wider brush and never emits fill tool', () => {
    expect(resolveLandingStrokeTool({ tool: 'Fill' })).toEqual({
      tool: 'brush',
      widthScale: 2.4,
    })
    expect(resolveLandingStrokeTool({ tool: 'fill' }).tool).toBe('brush')
    expect(resolveLandingStrokeTool({ tool: 'Eraser' }).tool).toBe('eraser')

    const empty = createEmptyDocument({ garmentId: 'tee' })
    const filled = addLandingStroke({
      document: empty,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.5, y: 0.5 },
      ],
      color: '#112233',
      width: 0.04,
      tool: 'Fill',
      opacity: 0.5,
    })
    const paint = filled.layers.find((layer) => layer.kind === 'paint')
    expect(paint?.kind).toBe('paint')
    if (paint?.kind === 'paint') {
      expect(paint.strokes[0]?.tool).toBe('brush')
      expect(paint.strokes[0]?.width).toBeCloseTo(0.04 * 2.4)
      expect(paint.strokes[0]?.color).toMatch(/^#112233/i)
      expect(paint.strokes[0]?.color.length).toBe(9)
    }
  })

  test('rejects unsafe graphic sources when stamping', () => {
    const empty = createEmptyDocument({ garmentId: 'tee' })
    const rejected = stampLandingGraphic({
      document: empty,
      src: 'https://evil.example/x.svg',
    })
    expect(rejected.layers).toEqual(empty.layers)

    const accepted = stampLandingGraphic({
      document: empty,
      src: '/graphics/cross-simple.svg',
    })
    expect(accepted.layers.length).toBeGreaterThan(empty.layers.length)
  })

  test('builds cloth overrides from texture id', () => {
    const washed = landingClothOverrides({
      color: '#abcdef',
      textureId: 'washed',
    })
    const standard = landingClothOverrides({
      color: '#abcdef',
      textureId: 'standard',
    })
    expect(washed[0]?.color).toBe('#abcdef')
    expect(washed[0]?.roughness).toBeGreaterThan(standard[0]?.roughness ?? 0)
  })

  test('encodes opacity into 8-digit hex color', () => {
    expect(colorWithOpacity({ color: '#ff00aa', opacity: 1 })).toBe('#ff00aaff')
    expect(colorWithOpacity({ color: '#ff00aa', opacity: 0 })).toBe('#ff00aa00')
    expect(colorWithOpacity({ color: '#abc', opacity: 0.5 })).toBe('#aabbcc80')
  })
})

describe('drawing on a side of the landing tee', () => {
  test("each view draws on its own panel, sleeves by the wearer's side", () => {
    const resolved = resolveTemplate({ id: 'tee-crew-short', version: 4 })
    expect(resolved.ok).toBe(true)

    if (resolved.ok) {
      for (const view of ['front', 'back', 'left', 'right'] as const) {
        expect(LANDING_VIEW_PANEL[view]).toBe(resolved.manifest.regions[view]!.renderPanel)
      }
    }
  })

  test("the pad takes its panel's shape, so ink reaches every edge of it", () => {
    for (const panel of ['front', 'back', 'left', 'right']) {
      const panelAspect = LANDING_PANEL_ASPECT[panel]!
      // Top-left and bottom-right of the pad are the panel's own corners.
      expect(padToPanel({ x: 0, y: 0, padAspect: panelAspect, panelAspect })).toEqual({ x: 0, y: 0 })
      expect(padToPanel({ x: 1, y: 1, padAspect: panelAspect, panelAspect })).toEqual({ x: 1, y: 1 })
    }

    // The pad's top is the panel's top: y runs up the tee from the hem.
    expect(padToSketch({ x: 0.2, y: 0, padAspect: 1, panelAspect: 1 })).toEqual({ x: 0.2, y: 1 })
    expect(padToSketch({ x: 0.2, y: 1, padAspect: 1, panelAspect: 1 })).toEqual({ x: 0.2, y: 0 })

    // A pad a pixel off its panel's shape still runs (almost) edge to edge.
    const front = padToPanel({ x: 0.5, y: 1, padAspect: 0.62, panelAspect: LANDING_PANEL_ASPECT.front! })
    expect(front.y).toBeGreaterThan(0.98)
  })

  test("the panel aspects are the hero tee's own", () => {
    const rendered = landingRenderDocument({})

    for (const [panel, aspect] of Object.entries(LANDING_PANEL_ASPECT)) {
      const render = Object.entries(landingPanelRoutes()).find(([, route]) => route.panel === panel)![0]
      expect(rendered.panelAspects?.[render]).toBeCloseTo(aspect, 2)
    }
  })

  test('a point on the 3D tee writes back to the sketch panel that renders there', () => {
    const routes = landingPanelRoutes()
    expect(Object.keys(routes).sort()).toEqual(['back', 'front', 'left', 'right'])

    for (const [render, route] of Object.entries(routes)) {
      // A mark put where the hit says lands back under the pointer.
      const at = toSketchPoint({ panel: render, x: 0.3, y: 0.7 })
      expect(at.panel).toBe(route.panel)
      const stamped = stampLandingGraphic({ document: createEmptyDocument({ garmentId: 'tee' }), src: '/graphics/logo-crown.svg', panel: at.panel, x: at.x, y: at.y })
      const shown = landingRenderDocument({ document: stamped }).layers.find((layer) => layer.kind === 'graphic')
      expect(shown).toMatchObject({ panel: render, y: 0.7 })
      expect(shown?.kind === 'graphic' && shown.x).toBeCloseTo(0.3, 6)
    }
  })
})

describe('editing a logo on the landing tee', () => {
  const stamped = () => {
    const document = stampLandingGraphic({ document: createEmptyDocument({ garmentId: 'tee' }), src: '/graphics/logo-crown.svg', panel: 'front' })
    return { document, layerId: latestLandingGraphicId({ document })! }
  }

  test('moves, resizes within bounds, and removes', () => {
    const { document, layerId } = stamped()
    const moved = updateLandingGraphicTransform({ document, layerId, x: 0.3, y: 0.9 })
    expect(moved.layers.find((layer) => layer.id === layerId)).toMatchObject({ x: 0.3, y: 0.9, scale: 0.28 })

    const larger = scaleLandingGraphic({ document: moved, layerId, factor: LANDING_SCALE_STEP })
    expect(larger.layers.find((layer) => layer.id === layerId)).toMatchObject({ scale: 0.28 * LANDING_SCALE_STEP })
    let tiny = larger

    for (let press = 0; press < 20; press += 1) {
      tiny = scaleLandingGraphic({ document: tiny, layerId, factor: 1 / LANDING_SCALE_STEP })
    }

    expect(tiny.layers.find((layer) => layer.id === layerId)).toMatchObject({ scale: 0.08 })

    const removed = removeLandingGraphic({ document: larger, layerId })
    expect(removed.layers.some((layer) => layer.id === layerId)).toBe(false)
    // Only graphics: a paint layer's id is left alone.
    const paintId = removed.layers[0]!.id
    expect(removeLandingGraphic({ document: removed, layerId: paintId })).toBe(removed)
  })

  test('the store keeps the picked logo, and a drag lets go of a held side', () => {
    const store = useLandingDemoStore
    const { layerId } = stamped()
    store.getState().selectLayer(layerId)
    expect(store.getState().selectedLayerId).toBe(layerId)
    store.getState().selectLayer(null)
    expect(store.getState().selectedLayerId).toBeNull()

    expect(store.getState().surfaceMode).toBe('turn')
    store.getState().setSurfaceMode('draw')
    expect(store.getState().surfaceMode).toBe('draw')

    store.getState().setCameraView('back')
    store.getState().releaseCameraView()
    expect(store.getState().cameraView).toBeNull()
  })

  test('the picked logo is framed on the tee, round its own box', () => {
    const { document, layerId } = stamped()
    const rendered = landingRenderDocument({ document })
    const framed = withLandingOverlays({ document: rendered, selectedLayerId: layerId })
    const overlay = framed.layers.at(-1)
    expect(overlay?.kind).toBe('paint')
    const frame = overlay?.kind === 'paint' ? overlay.strokes[0]! : null
    expect(frame?.points).toHaveLength(5)
    expect(frame?.panel).toBe('front')
    // Nothing picked: the document is the render document as it was.
    expect(withLandingOverlays({ document: rendered, selectedLayerId: null })).toBe(rendered)
  })
})
