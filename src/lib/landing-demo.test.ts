import { describe, expect, test } from 'vitest'

import { createEmptyDocument } from './design-document'
import {
  addLandingStroke,
  applyLandingPattern,
  cameraViewAzimuth,
  colorWithOpacity,
  garmentCategory,
  LANDING_CAMERA_POSITIONS,
  landingClothOverrides,
  latestLandingGraphicId,
  listGarmentsByCategory,
  pickCannedStillGrid,
  resolveLandingStrokeTool,
  sampleSizeMeasurements,
  stampLandingGraphic,
  studioEnvAppearance,
  updateLandingGraphicTransform,
  videoStillForScene,
  CANNED_STILLS,
  SHOOT_PRESETS,
  VIDEO_SCENES,
} from './landing-demo'

describe('landing-demo', () => {
  test('maps garments into marketing categories', () => {
    expect(garmentCategory({ garmentId: 'tee' })).toBe('tops')
    expect(garmentCategory({ garmentId: 'coat' })).toBe('outerwear')
    expect(listGarmentsByCategory({ category: 'tops' }).length).toBeGreaterThan(
      0,
    )
    expect(listGarmentsByCategory({ category: 'bottoms' })).toEqual([])
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
    expect(cameraViewAzimuth({ view: 'left' })).toBe(-Math.PI / 2)
    expect(cameraViewAzimuth({ view: 'right' })).toBe(Math.PI / 2)
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
