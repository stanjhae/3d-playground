/**
 * The shape parameters on their own, with no three.js, so the validator
 * (shared with the API) can check them. The deformer is `garment-shape.ts`.
 *
 * Each template with a shape map has its own field list (`shapeSpecFor`):
 * a stored `shape` block holds exactly that template's fields. The tee's
 * five fields and limits are shape v1's, unchanged.
 */

/** Every shape field any template uses. */
export type ShapeField =
  /** Wearer's left sleeve, as a fraction of its own length. */
  | 'leftSleeveLength'
  /** Wearer's right sleeve, as a fraction of its own length. */
  | 'rightSleeveLength'
  /** Armpit-to-hem length (the dress: waist-to-hem), as a fraction of itself. */
  | 'bodyLength'
  /** Width below the armpits, as a fraction of itself. */
  | 'bodyWidth'
  /** Centre-front drop of the neckline, 0 (as made) to 1 (deepest). */
  | 'necklineDepth'
  /** The dress: the skirt widens toward the hem, as a fraction of the hem. */
  | 'hemFlare'
  /** Trousers: the wearer's left leg, crotch to hem, as a fraction of itself. */
  | 'leftLegLength'
  /** Trousers: the wearer's right leg, crotch to hem, as a fraction of itself. */
  | 'rightLegLength'
  /** Trousers: width at the waist and hips, as a fraction of itself. */
  | 'waistWidth'

/** A shape: one value per field of its template; a missing field reads as 0. */
export type GarmentShape = { [F in ShapeField]?: number }

export type ShapeLimits = Partial<Record<ShapeField, { min: number; max: number }>>

export type ShapeControl = { field: ShapeField; label: string; step: number }

/** What a template's shape map offers: its fields, their safe ranges, the sliders. */
export type ShapeSpec = {
  fields: readonly ShapeField[]
  limits: ShapeLimits
  /** The studio's sliders, in rail order (wearer's sides). */
  controls: readonly ShapeControl[]
  /** A pair one "Mirror" switch moves together (wearer's left first), if any. */
  pair?: { fields: readonly [ShapeField, ShapeField]; label: string; together: string }
}

/** The tee's fields (shape v1), in stored order. */
export const SHAPE_FIELDS = [
  'leftSleeveLength',
  'rightSleeveLength',
  'bodyLength',
  'bodyWidth',
  'necklineDepth',
] as const satisfies readonly ShapeField[]

export type TeeShapeField = (typeof SHAPE_FIELDS)[number]

/** The tee's safe ranges: past these it tears at a seam or folds into itself. */
export const SHAPE_LIMITS: Record<TeeShapeField, { min: number; max: number }> = {
  leftSleeveLength: { min: -0.6, max: 1.5 },
  rightSleeveLength: { min: -0.6, max: 1.5 },
  bodyLength: { min: -0.4, max: 0.4 },
  bodyWidth: { min: -0.15, max: 0.25 },
  necklineDepth: { min: 0, max: 1 },
}

/** The tee's neutral shape, as stored fields. */
export const NEUTRAL_SHAPE: Record<TeeShapeField, number> = {
  leftSleeveLength: 0,
  rightSleeveLength: 0,
  bodyLength: 0,
  bodyWidth: 0,
  necklineDepth: 0,
}

const STEP = 0.01

const SLEEVE_PAIR = {
  fields: ['leftSleeveLength', 'rightSleeveLength'],
  label: 'Mirror sleeves',
  together: 'Sleeves',
} as const satisfies ShapeSpec['pair']

/** The tee's sliders, in rail order (wearer's sides). */
export const SHAPE_CONTROLS: readonly ShapeControl[] = [
  { field: 'rightSleeveLength', label: "Right sleeve (wearer's)", step: STEP },
  { field: 'leftSleeveLength', label: "Left sleeve (wearer's)", step: STEP },
  { field: 'bodyLength', label: 'Length', step: STEP },
  { field: 'bodyWidth', label: 'Width', step: STEP },
  { field: 'necklineDepth', label: 'Neckline depth', step: STEP },
]

const TEE_SPEC: ShapeSpec = { fields: SHAPE_FIELDS, limits: SHAPE_LIMITS, controls: SHAPE_CONTROLS, pair: SLEEVE_PAIR }

/**
 * The hoodie: long sleeves that hang at its sides, a ribbed hem. No
 * neckline: the hood is sewn into it.
 */
const HOODIE_SPEC: ShapeSpec = {
  fields: ['leftSleeveLength', 'rightSleeveLength', 'bodyLength', 'bodyWidth'],
  limits: {
    leftSleeveLength: { min: -0.6, max: 0.25 },
    rightSleeveLength: { min: -0.6, max: 0.25 },
    bodyLength: { min: -0.3, max: 0.35 },
    bodyWidth: { min: -0.1, max: 0.2 },
  },
  controls: [
    { field: 'rightSleeveLength', label: "Right sleeve (wearer's)", step: STEP },
    { field: 'leftSleeveLength', label: "Left sleeve (wearer's)", step: STEP },
    { field: 'bodyLength', label: 'Length', step: STEP },
    { field: 'bodyWidth', label: 'Width', step: STEP },
  ],
  pair: SLEEVE_PAIR,
}

const BODY_CONTROLS: readonly ShapeControl[] = [
  { field: 'bodyLength', label: 'Length', step: STEP },
  { field: 'bodyWidth', label: 'Width', step: STEP },
  { field: 'necklineDepth', label: 'Neckline depth', step: STEP },
]

/** The vest already has a deep V, so its neckline drops less. */
const VEST_SPEC: ShapeSpec = {
  fields: ['bodyLength', 'bodyWidth', 'necklineDepth'],
  limits: {
    bodyLength: { min: -0.35, max: 0.35 },
    bodyWidth: { min: -0.1, max: 0.2 },
    necklineDepth: { min: 0, max: 0.6 },
  },
  controls: BODY_CONTROLS,
}

/** The crop top lengthens as far as a regular top. */
const CROP_SPEC: ShapeSpec = {
  fields: ['bodyLength', 'bodyWidth', 'necklineDepth'],
  limits: {
    bodyLength: { min: -0.3, max: 1 },
    bodyWidth: { min: -0.1, max: 0.2 },
    necklineDepth: { min: 0, max: 1 },
  },
  controls: BODY_CONTROLS,
}

/** The dress: length is the skirt's, waist to hem; the flare widens it toward the hem. */
const DRESS_SPEC: ShapeSpec = {
  fields: ['bodyLength', 'bodyWidth', 'hemFlare'],
  limits: {
    bodyLength: { min: -0.5, max: 0.3 },
    bodyWidth: { min: -0.1, max: 0.2 },
    hemFlare: { min: -0.3, max: 0.6 },
  },
  controls: [
    { field: 'bodyLength', label: 'Length', step: STEP },
    { field: 'bodyWidth', label: 'Width', step: STEP },
    { field: 'hemFlare', label: 'Hem flare', step: STEP },
  ],
}

/** Trousers: each leg, crotch to hem (down to shorts), and the waist and hips. */
const TROUSERS_SPEC: ShapeSpec = {
  fields: ['leftLegLength', 'rightLegLength', 'waistWidth'],
  limits: {
    leftLegLength: { min: -0.75, max: 0.1 },
    rightLegLength: { min: -0.75, max: 0.1 },
    waistWidth: { min: -0.15, max: 0.25 },
  },
  controls: [
    { field: 'rightLegLength', label: "Right leg (wearer's)", step: STEP },
    { field: 'leftLegLength', label: "Left leg (wearer's)", step: STEP },
    { field: 'waistWidth', label: 'Waist & hips', step: STEP },
  ],
  pair: { fields: ['leftLegLength', 'rightLegLength'], label: 'Mirror legs', together: 'Legs' },
}

/** Template versions with a shape map besides the tee (`id@version`). */
const SPECS: Record<string, ShapeSpec> = {
  'hoodie@1': HOODIE_SPEC,
  'vest@1': VEST_SPEC,
  'crop@1': CROP_SPEC,
  'dress@1': DRESS_SPEC,
  'trousers@1': TROUSERS_SPEC,
}

/** The template's shape map, or null when it has none (and ignores `shape`). */
export function shapeSpecFor({ template }: { template: { id: string; version: number } }): ShapeSpec | null {
  if (template.id === 'tee-crew-short') {
    return template.version >= 4 ? TEE_SPEC : null
  }

  return SPECS[`${template.id}@${template.version}`] ?? null
}

/** Which templates have a shape map. Others ignore `shape`. */
export function templateHasShape({ template }: { template: { id: string; version: number } }) {
  return shapeSpecFor({ template }) !== null
}

/** The template's neutral shape: each of its fields at 0. */
export function neutralShapeFor({ spec }: { spec: ShapeSpec }): GarmentShape {
  return Object.fromEntries(spec.fields.map((field) => [field, 0]))
}

/** Stored values keep three decimals; the sliders step finer than you can see. */
function round3(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

/** `value` within the field's range (the tee's when no spec is given). */
export function clampShapeValue({ field, value, spec = TEE_SPEC }: { field: ShapeField; value: number; spec?: ShapeSpec }) {
  const limits = spec.limits[field]

  if (!limits) {
    return 0
  }

  return Number.isFinite(value) ? round3(Math.min(limits.max, Math.max(limits.min, value))) : 0
}

/** The spec's fields (the tee's when none is given), each clamped; others dropped. */
export function clampShape({ shape, spec = TEE_SPEC }: { shape: GarmentShape; spec?: ShapeSpec }): GarmentShape {
  return Object.fromEntries(
    spec.fields.map((field) => [field, clampShapeValue({ field, value: shape[field] ?? 0, spec })]),
  )
}

export function isNeutralShape({ shape }: { shape?: GarmentShape | null }) {
  return !shape || Object.values(shape).every((value) => (value ?? 0) === 0)
}

/** A slider's value in words: a signed percentage, or the neckline's share. */
export function shapeValueLabel({ field, value }: { field: ShapeField; value: number }) {
  const percent = Math.round(value * 100)
  return field === 'necklineDepth' ? `${percent}%` : `${percent > 0 ? '+' : ''}${percent}%`
}
