import { flattenOutline, outlineRun, polylineLength } from './bezier.ts'
import { mirrorOutline } from './mirror.ts'
import type { PatternFabric, PatternPiece, PatternPlacement, PatternPoint, PatternSeam } from './pattern-document.ts'

/**
 * Pattern families: the garment blocks every pattern template is made of
 * (a bodice, a set-in sleeve, a hood, a skirt, trousers). Each returns
 * pieces with roles and the seams between them, sized in millimetres.
 * Templates call them with a garment's measures; "reset to template" calls
 * them again. Changing what a family returns changes every template built
 * on it, so `templates.test.ts` pins each template version's hash.
 *
 * Conventions: y up from the piece's lowest point, +x to the right as seen
 * from outside. On the front, +x is the wearer's left; on the back, −x.
 */

type Part = { pieces: PatternPiece[]; seams: PatternSeam[] }

type Pair = [number, number]

const round = (value: number) => Math.round(value)

function point(id: string, x: number, y: number, extra: Partial<PatternPoint> = {}): PatternPoint {
  return { id, x: round(x), y: round(y), ...extra }
}

function piece({
  id,
  panel,
  label,
  outline,
  roles,
  place,
  fabric,
}: {
  id: string
  panel: string
  label: string
  outline: PatternPoint[]
  roles: PatternPiece['roles']
  place: PatternPlacement
  fabric?: PatternFabric
}): PatternPiece {
  // The frame layout sets the real origin later (`layoutFrames`).
  return { id, panel, label, panelOrigin: [0, 0], outline, roles, place, ...(fabric ? { fabric } : {}) }
}

/** Length of the counter-clockwise run from `from` to `to`. */
export function runLength(outline: readonly PatternPoint[], from: string, to: string) {
  return polylineLength(outlineRun({ flat: flattenOutline({ outline }), outline, from, to }))
}

// --- Bodice ------------------------------------------------------------------

export type BodiceSpec = {
  hemHalf: number
  /** A fitted waist, optional. */
  waist?: { half: number; y: number }
  armpitHalf: number
  armpitY: number
  shoulderHalf: number
  shoulderY: number
  neckHalf: number
  neckY: number
  frontNeckDip: number
  backNeckDip: number
  neck: 'round' | 'v' | 'square'
  /** How far the armhole's middle curves in toward the body. */
  armholeIn: number
  /** The back's neckline shape, when it differs from the front's. */
  backNeck?: 'round' | 'v' | 'square'
}

function neckPoints(spec: BodiceSpec, dip: number, style: BodiceSpec['neck']): PatternPoint[] {
  const { neckHalf, neckY } = spec

  if (style === 'square') {
    return [point('neckR', neckHalf, neckY), point('neckRb', neckHalf, neckY - dip), point('neckLb', -neckHalf, neckY - dip), point('neckL', -neckHalf, neckY)]
  }

  if (style === 'v') {
    return [point('neckR', neckHalf, neckY), point('neckC', 0, neckY - dip), point('neckL', -neckHalf, neckY)]
  }

  const handle = round(neckHalf * 0.6)
  const drop = round(Math.min(dip * 0.5, 40))
  return [
    point('neckR', neckHalf, neckY, { ho: [0, -drop] }),
    point('neckC', 0, neckY - dip, { k: 's', hi: [handle, 0], ho: [-handle, 0] }),
    point('neckL', -neckHalf, neckY, { hi: [0, -drop] }),
  ]
}

function bodiceOutline(spec: BodiceSpec, dip: number, style: BodiceSpec['neck']): PatternPoint[] {
  const midX = (spec.armpitHalf + spec.shoulderHalf) / 2 - spec.armholeIn
  const midY = (spec.armpitY + spec.shoulderY) / 2
  const waist = spec.waist
  return [
    point('hemL', -spec.hemHalf, 0),
    point('hemR', spec.hemHalf, 0),
    ...(waist ? [point('waistR', waist.half, waist.y)] : []),
    point('armR', spec.armpitHalf, spec.armpitY),
    point('armRm', midX, midY, { k: 's' }),
    point('shR', spec.shoulderHalf, spec.shoulderY),
    ...neckPoints(spec, dip, style),
    point('shL', -spec.shoulderHalf, spec.shoulderY),
    point('armLm', -midX, midY, { k: 's' }),
    point('armL', -spec.armpitHalf, spec.armpitY),
    ...(waist ? [point('waistL', -waist.half, waist.y)] : []),
  ]
}

function bodiceRoles(outline: PatternPoint[]): PatternPiece['roles'] {
  const has = (id: string) => outline.some((p) => p.id === id)
  const neck = outline.filter((p) => p.id.startsWith('neck')).map((p) => p.id)
  return {
    hem: ['hemL', 'hemR'],
    side: ['hemL', 'hemR', ...(has('waistR') ? ['waistR', 'waistL'] : [])],
    armhole: ['armR', 'armL'],
    shoulder: ['shR', 'shL'],
    neck,
    ...(has('waistR') ? { waist: ['waistR', 'waistL'] } : {}),
  }
}

/** Front and back of an upper body, sewn at the sides and shoulders. */
export function bodice({
  spec,
  prefix = '',
  panels = { front: 'front', back: 'back' },
  labels = { front: 'Front', back: 'Back' },
  fabric,
  lift = 0,
}: {
  spec: BodiceSpec
  prefix?: string
  panels?: { front: string; back: string }
  labels?: { front: string; back: string }
  fabric?: PatternFabric
  /** Millimetres the pieces start in front of and behind the body. */
  lift?: number
}): Part {
  const front = `${prefix}front`
  const back = `${prefix}back`
  const frontOutline = bodiceOutline(spec, spec.frontNeckDip, spec.neck)
  const backOutline = bodiceOutline(spec, spec.backNeckDip, spec.backNeck ?? (spec.neck === 'square' ? 'square' : 'round'))
  const place = (anchor: 'front' | 'back'): PatternPlacement => ({ anchor, wrap: 'plane', offset: [0, -spec.shoulderY, 100 + lift], rot: 0 })
  const neckEnds = (outline: PatternPoint[]) => [outline.find((p) => p.id === 'neckR')!.id, outline.find((p) => p.id === 'neckL')!.id]
  const [fNeckR, fNeckL] = neckEnds(frontOutline)
  const [bNeckR, bNeckL] = neckEnds(backOutline)

  return {
    pieces: [
      piece({ id: front, panel: panels.front, label: labels.front, outline: frontOutline, roles: bodiceRoles(frontOutline), place: place('front'), fabric }),
      piece({ id: back, panel: panels.back, label: labels.back, outline: backOutline, roles: bodiceRoles(backOutline), place: place('back'), fabric }),
    ],
    seams: [
      // Front +x and back −x are the wearer's left.
      { id: `${prefix}sideL`, kind: 'sew', a: { piece: front, from: 'hemR', to: 'armR' }, b: { piece: back, from: 'armL', to: 'hemL' } },
      { id: `${prefix}sideR`, kind: 'sew', a: { piece: front, from: 'armL', to: 'hemL' }, b: { piece: back, from: 'hemR', to: 'armR' } },
      { id: `${prefix}shoulderL`, kind: 'sew', a: { piece: front, from: 'shR', to: fNeckR! }, b: { piece: back, from: bNeckL!, to: 'shL' } },
      { id: `${prefix}shoulderR`, kind: 'sew', a: { piece: front, from: fNeckL!, to: 'shL' }, b: { piece: back, from: 'shR', to: bNeckR! } },
    ],
  }
}

// --- Sleeve ------------------------------------------------------------------

export type SleeveSpec = {
  /** Cap top to cuff. */
  length: number
  cuffHalf: number
  /** How far the cap rises above its corners. */
  capHeight: number
}

/** A sleeve cap whose half matches `armhole` millimetres, eased a little. */
function sleeveOutline(spec: SleeveSpec, armhole: number): PatternPoint[] {
  const capY = spec.length - spec.capHeight
  const build = (half: number) => {
    const handle = round(half * 0.55)
    return [
      point('cuffL', -spec.cuffHalf, 0),
      point('cuffR', spec.cuffHalf, 0),
      point('capR', half, capY),
      point('capMid', 0, spec.length, { k: 's', hi: [handle, 0], ho: [-handle, 0] }),
      point('capL', -half, capY),
    ]
  }

  // Widen the cap until each half is 2% longer than its armhole (ease).
  let low = 20
  let high = 800

  for (let i = 0; i < 30; i += 1) {
    const mid = (low + high) / 2

    if (runLength(build(mid), 'capR', 'capMid') < armhole * 1.02) {
      low = mid
    } else {
      high = mid
    }
  }

  return build(low)
}

/**
 * Two set-in sleeves (the left mirrors the right) sewn into a bodice's
 * armholes. On both, the capR half faces the front.
 */
export function sleeves({
  spec,
  front,
  back,
  fabric,
}: {
  spec: SleeveSpec
  front: PatternPiece
  back: PatternPiece
  fabric?: PatternFabric
}): Part {
  const armhole = Math.max(runLength(front.outline!, 'armR', 'shR'), runLength(back.outline!, 'shL', 'armL'))
  const outline = sleeveOutline(spec, armhole)
  const place = (side: 'left' | 'right'): PatternPlacement => ({ anchor: `arm-${side}`, wrap: 'cylinder', offset: [0, 30, 12], rot: 0 })
  const roles = { cuff: ['cuffL', 'cuffR'], armhole: ['capR', 'capL'] }

  return {
    pieces: [
      piece({ id: 'sleeveR', panel: 'right', label: 'Right sleeve', outline, roles, place: place('right'), fabric }),
      { id: 'sleeveL', panel: 'left', label: 'Left sleeve', panelOrigin: [0, 0], mirrorOf: 'sleeveR', roles, place: place('left'), ...(fabric ? { fabric } : {}) },
    ],
    seams: [
      { id: 'capFrontL', kind: 'ease', a: { piece: front.id, from: 'armR', to: 'shR' }, b: { piece: 'sleeveL', from: 'capMid', to: 'capR' } },
      { id: 'capBackL', kind: 'ease', a: { piece: back.id, from: 'shL', to: 'armL' }, b: { piece: 'sleeveL', from: 'capL', to: 'capMid' } },
      { id: 'capFrontR', kind: 'ease', a: { piece: front.id, from: 'shL', to: 'armL' }, b: { piece: 'sleeveR', from: 'capR', to: 'capMid' } },
      { id: 'capBackR', kind: 'ease', a: { piece: back.id, from: 'armR', to: 'shR' }, b: { piece: 'sleeveR', from: 'capMid', to: 'capL' } },
      { id: 'underR', kind: 'sew', a: { piece: 'sleeveR', from: 'cuffR', to: 'capR' }, b: { piece: 'sleeveR', from: 'capL', to: 'cuffL' } },
      { id: 'underL', kind: 'sew', a: { piece: 'sleeveL', from: 'capR', to: 'cuffR' }, b: { piece: 'sleeveL', from: 'cuffL', to: 'capL' } },
    ],
  }
}

// --- Hood --------------------------------------------------------------------

/**
 * Two hood halves sewn over the crown and into a round neckline. The left
 * half is drawn as seen from the left: the face opening at x = 0, the nape
 * at the far end of its bottom edge.
 */
export function hood({ front, back, height }: { front: PatternPiece; back: PatternPiece; height: number }): Part {
  const frontHalf = runLength(front.outline!, 'neckR', 'neckC')
  const backHalf = runLength(back.outline!, 'neckC', 'neckL')
  const depth = frontHalf + backHalf
  const outline = [
    point('hfB', 0, 0),
    point('hSide', frontHalf, 0),
    point('hbB', depth, 0),
    point('hCrown', depth + 40, height * 0.55, { k: 's', hi: [10, -90], ho: [-10, 90] }),
    point('hTop', depth * 0.45, height, { k: 's', hi: [110, 0], ho: [-110, 0] }),
    point('hfT', 0, height * 0.8),
  ]
  const place = (anchor: 'side-left' | 'side-right'): PatternPlacement => ({ anchor, wrap: 'plane', offset: [-100, 30, 130], rot: 0 })
  const roles = { hood: ['hfT', 'hTop', 'hCrown'] }

  return {
    pieces: [
      piece({ id: 'hoodL', panel: 'hood-left', label: 'Hood, left side', outline, roles, place: place('side-left'), fabric: 'fleece' }),
      {
        id: 'hoodR',
        panel: 'hood-right',
        label: 'Hood, right side',
        panelOrigin: [0, 0],
        mirrorOf: 'hoodL',
        roles,
        place: { ...place('side-right'), offset: [100, 30, 130] },
        fabric: 'fleece',
      },
    ],
    seams: [
      { id: 'crown', kind: 'sew', a: { piece: 'hoodL', from: 'hbB', to: 'hfT' }, b: { piece: 'hoodR', from: 'hfT', to: 'hbB' } },
      { id: 'hoodFrontL', kind: 'sew', a: { piece: 'hoodL', from: 'hfB', to: 'hSide' }, b: { piece: front.id, from: 'neckR', to: 'neckC' } },
      { id: 'hoodBackL', kind: 'sew', a: { piece: 'hoodL', from: 'hSide', to: 'hbB' }, b: { piece: back.id, from: 'neckC', to: 'neckL' } },
      { id: 'hoodFrontR', kind: 'sew', a: { piece: 'hoodR', from: 'hSide', to: 'hfB' }, b: { piece: front.id, from: 'neckC', to: 'neckL' } },
      { id: 'hoodBackR', kind: 'sew', a: { piece: 'hoodR', from: 'hbB', to: 'hSide' }, b: { piece: back.id, from: 'neckR', to: 'neckC' } },
    ],
  }
}

// --- Skirt -------------------------------------------------------------------

export type SkirtSpec = {
  /** Hem to waist. */
  length: number
  waistHalf: number
  hipHalf: number
  /** Hem to hip line. */
  hipY: number
  hemHalf: number
  /** Where the waist sits on the body, metres up from the floor. */
  waistAt: number
}

/** A two-piece skirt hung from the waist. */
export function skirt({ spec, panels = { front: 'front', back: 'back' }, fabric }: { spec: SkirtSpec; panels?: { front: string; back: string }; fabric?: PatternFabric }): Part {
  const outline = [
    point('hemL', -spec.hemHalf, 0),
    point('hemR', spec.hemHalf, 0),
    point('hipR', spec.hipHalf, spec.hipY, { k: 's' }),
    point('waistR', spec.waistHalf, spec.length),
    point('waistL', -spec.waistHalf, spec.length),
    point('hipL', -spec.hipHalf, spec.hipY, { k: 's' }),
  ]
  const roles = { hem: ['hemL', 'hemR'], side: ['hemL', 'hemR'], waist: ['waistR', 'waistL'] }
  // The hip anchor sits 0.92 m up; the waist lands at `waistAt`.
  const offsetY = round(spec.waistAt * 1000 - 920 - spec.length)
  const place = (anchor: 'hip-front' | 'hip-back'): PatternPlacement => ({ anchor, wrap: 'plane', offset: [0, offsetY, 110], rot: 0 })

  return {
    pieces: [
      piece({ id: 'skirtFront', panel: panels.front, label: 'Skirt front', outline, roles, place: place('hip-front'), fabric }),
      piece({ id: 'skirtBack', panel: panels.back, label: 'Skirt back', outline, roles, place: place('hip-back'), fabric }),
    ],
    seams: [
      { id: 'skirtSideL', kind: 'sew', a: { piece: 'skirtFront', from: 'hemR', to: 'waistR' }, b: { piece: 'skirtBack', from: 'waistL', to: 'hemL' } },
      { id: 'skirtSideR', kind: 'sew', a: { piece: 'skirtFront', from: 'waistL', to: 'hemL' }, b: { piece: 'skirtBack', from: 'hemR', to: 'waistR' } },
    ],
  }
}

// --- Trousers ----------------------------------------------------------------

export type TrouserSpec = {
  /** Hem to waist. */
  length: number
  waistHalf: number
  hipHalf: number
  hipY: number
  /** Hem to crotch. */
  crotchY: number
  /** Outer and inner x of each leg at the hem. */
  cuffOuter: number
  cuffInner: number
  waistAt: number
}

/** Trousers as a front and a back, each spanning both legs. */
export function trousers({ spec, panels = { front: 'front', back: 'back' }, fabric }: { spec: TrouserSpec; panels?: { front: string; back: string }; fabric?: PatternFabric }): Part {
  const outline = [
    point('cuffLo', -spec.cuffOuter, 0),
    point('cuffLi', -spec.cuffInner, 0),
    point('crotch', 0, spec.crotchY),
    point('cuffRi', spec.cuffInner, 0),
    point('cuffRo', spec.cuffOuter, 0),
    point('hipR', spec.hipHalf, spec.hipY, { k: 's' }),
    point('waistR', spec.waistHalf, spec.length),
    point('waistL', -spec.waistHalf, spec.length),
    point('hipL', -spec.hipHalf, spec.hipY, { k: 's' }),
  ]
  const roles = { hem: ['cuffLo', 'cuffLi', 'cuffRi', 'cuffRo'], waist: ['waistR', 'waistL'] }
  const offsetY = round(spec.waistAt * 1000 - 920 - spec.length)
  const place = (anchor: 'hip-front' | 'hip-back'): PatternPlacement => ({ anchor, wrap: 'plane', offset: [0, offsetY, 110], rot: 0 })

  return {
    pieces: [
      piece({ id: 'trouserFront', panel: panels.front, label: 'Trousers front', outline, roles, place: place('hip-front'), fabric }),
      piece({ id: 'trouserBack', panel: panels.back, label: 'Trousers back', outline, roles, place: place('hip-back'), fabric }),
    ],
    seams: [
      { id: 'outseamL', kind: 'sew', a: { piece: 'trouserFront', from: 'cuffRo', to: 'waistR' }, b: { piece: 'trouserBack', from: 'waistL', to: 'cuffLo' } },
      { id: 'outseamR', kind: 'sew', a: { piece: 'trouserFront', from: 'waistL', to: 'cuffLo' }, b: { piece: 'trouserBack', from: 'cuffRo', to: 'waistR' } },
      { id: 'inseamL', kind: 'sew', a: { piece: 'trouserFront', from: 'crotch', to: 'cuffRi' }, b: { piece: 'trouserBack', from: 'cuffLi', to: 'crotch' } },
      { id: 'inseamR', kind: 'sew', a: { piece: 'trouserFront', from: 'cuffLi', to: 'crotch' }, b: { piece: 'trouserBack', from: 'crotch', to: 'cuffRi' } },
    ],
  }
}

// --- Frames ------------------------------------------------------------------

export type PatternFrame = { width: number; height: number; mirrorX?: boolean }

/**
 * Lays each panel's pieces into a fixed print frame: stacked top to bottom
 * in the order given (higher on the body first), centred, with a margin,
 * and widened or heightened to the panel's aspect (width / height) so a
 * print keeps its proportions. Sets each piece's `panelOrigin`.
 */
export function layoutFrames({
  pieces,
  aspects,
  margin = 0.15,
}: {
  pieces: PatternPiece[]
  aspects: Record<string, number>
  margin?: number
}): Record<string, PatternFrame> {
  const frames: Record<string, PatternFrame> = {}
  const drawn = new Map(pieces.filter((p) => p.outline).map((p) => [p.id, p.outline!]))
  const outlineOf = (p: PatternPiece) => p.outline ?? mirrorOutline(drawn.get(p.mirrorOf!) ?? [])
  const panels = [...new Set(pieces.map((p) => p.panel))]

  for (const panel of panels) {
    const members = pieces.filter((p) => p.panel === panel)
    const boxes = members.map((p) => {
      const points = flattenOutline({ outline: outlineOf(p) }).points
      const xs = points.map(([x]) => x)
      const ys = points.map(([, y]) => y)
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    })
    const contentWidth = Math.max(...boxes.map((b) => b.maxX - b.minX))
    const contentHeight = boxes.reduce((sum, b) => sum + (b.maxY - b.minY), 0)
    const pad = Math.max(contentWidth, contentHeight) * margin
    let width = contentWidth + pad * 2
    let height = contentHeight + pad * (members.length + 1)
    const aspect = aspects[panel] ?? width / height

    if (width / height < aspect) {
      width = height * aspect
    } else {
      height = width / aspect
    }

    width = round(width)
    height = round(height)
    let top = height - (height - contentHeight - pad * (members.length - 1)) / 2

    members.forEach((member, index) => {
      const box = boxes[index]!
      const boxHeight = box.maxY - box.minY
      const originX = round(width / 2 - (box.minX + box.maxX) / 2)
      const originY = round(top - boxHeight - box.minY)
      member.panelOrigin = [originX, originY] as Pair
      top -= boxHeight + pad
    })

    // A back panel reads as if seen through the body from the front.
    const mirrorX = members.every((p) => p.place.anchor === 'back' || p.place.anchor === 'hip-back')
    frames[panel] = { width, height, ...(mirrorX ? { mirrorX: true } : {}) }
  }

  return frames
}
