/**
 * The shape parameters on their own, with no three.js, so the validator
 * (shared with the API) can check them. The deformer is `garment-shape.ts`.
 */

export type GarmentShape = {
  /** Wearer's left sleeve, as a fraction of its own length. */
  leftSleeveLength: number
  /** Wearer's right sleeve, as a fraction of its own length. */
  rightSleeveLength: number
  /** Armpit-to-hem length, as a fraction of itself. */
  bodyLength: number
  /** Width below the armpits, as a fraction of itself. */
  bodyWidth: number
  /** Centre-front drop of the neckline, 0 (crew) to 1 (deepest scoop). */
  necklineDepth: number
}

export const SHAPE_FIELDS = [
  'leftSleeveLength',
  'rightSleeveLength',
  'bodyLength',
  'bodyWidth',
  'necklineDepth',
] as const satisfies readonly (keyof GarmentShape)[]

export type ShapeField = (typeof SHAPE_FIELDS)[number]

/** Safe ranges: past these the tee tears at a seam or folds into itself. */
export const SHAPE_LIMITS: Record<ShapeField, { min: number; max: number }> = {
  leftSleeveLength: { min: -0.6, max: 1.5 },
  rightSleeveLength: { min: -0.6, max: 1.5 },
  bodyLength: { min: -0.4, max: 0.4 },
  bodyWidth: { min: -0.15, max: 0.25 },
  necklineDepth: { min: 0, max: 1 },
}

export const NEUTRAL_SHAPE: GarmentShape = {
  leftSleeveLength: 0,
  rightSleeveLength: 0,
  bodyLength: 0,
  bodyWidth: 0,
  necklineDepth: 0,
}

/** Stored values keep three decimals; the sliders step finer than you can see. */
function round3(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

export function clampShapeValue({ field, value }: { field: ShapeField; value: number }) {
  const { min, max } = SHAPE_LIMITS[field]
  return Number.isFinite(value) ? round3(Math.min(max, Math.max(min, value))) : 0
}

export function clampShape({ shape }: { shape: Partial<GarmentShape> }): GarmentShape {
  return Object.fromEntries(
    SHAPE_FIELDS.map((field) => [field, clampShapeValue({ field, value: shape[field] ?? 0 })]),
  ) as GarmentShape
}

export function isNeutralShape({ shape }: { shape?: Partial<GarmentShape> | null }) {
  return !shape || SHAPE_FIELDS.every((field) => (shape[field] ?? 0) === 0)
}

/** Which templates have a shape map. Others ignore `shape`. */
export function templateHasShape({ template }: { template: { id: string; version: number } }) {
  return template.id === 'tee-crew-short' && template.version >= 4
}

/** The studio's shape sliders, in rail order (wearer's sides). */
export const SHAPE_CONTROLS: readonly { field: ShapeField; label: string; step: number }[] = [
  { field: 'rightSleeveLength', label: "Right sleeve (wearer's)", step: 0.01 },
  { field: 'leftSleeveLength', label: "Left sleeve (wearer's)", step: 0.01 },
  { field: 'bodyLength', label: 'Length', step: 0.01 },
  { field: 'bodyWidth', label: 'Width', step: 0.01 },
  { field: 'necklineDepth', label: 'Neckline depth', step: 0.01 },
]

/** A slider's value in words: a signed percentage, or the neckline's share. */
export function shapeValueLabel({ field, value }: { field: ShapeField; value: number }) {
  const percent = Math.round(value * 100)
  return field === 'necklineDepth' ? `${percent}%` : `${percent > 0 ? '+' : ''}${percent}%`
}
