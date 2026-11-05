import { HOUSE_COPY } from './house-copy'

export const CREATE_STEP_IDS = ['select', 'color', 'design', 'share'] as const

export type CreateStepId = (typeof CREATE_STEP_IDS)[number]

/** Steps that were merged. Links and bookmarks to them still land somewhere. */
export const MERGED_CREATE_STEPS: Readonly<Record<string, CreateStepId>> = {
  fit: 'select',
  preview: 'share',
}

export type CreateStepMeta = {
  id: CreateStepId
  label: string
}

export const CREATE_STEPS: readonly CreateStepMeta[] = [
  { id: 'select', label: HOUSE_COPY.selectStep },
  { id: 'color', label: HOUSE_COPY.colorStep },
  { id: 'design', label: HOUSE_COPY.designStep },
  { id: 'share', label: HOUSE_COPY.shareStep },
] as const

export function createStepLabel({ step }: { step: CreateStepId }) {
  return CREATE_STEPS.find((entry) => entry.id === step)?.label ?? step
}

export function createStepIndex({ step }: { step: CreateStepId }) {
  return CREATE_STEPS.findIndex((entry) => entry.id === step)
}

export function nextCreateStep({ step }: { step: CreateStepId }) {
  const index = createStepIndex({ step })

  if (index < 0 || index >= CREATE_STEPS.length - 1) {
    return step
  }

  return CREATE_STEPS[index + 1]?.id ?? step
}

export function previousCreateStep({ step }: { step: CreateStepId }) {
  const index = createStepIndex({ step })

  if (index <= 0) {
    return step
  }

  return CREATE_STEPS[index - 1]?.id ?? step
}

export function showsSilhouetteRail({ step }: { step: CreateStepId }) {
  return step === 'select'
}

export function showsStructureRail({ step }: { step: CreateStepId }) {
  return step === 'select'
}

export function showsColorRail({ step }: { step: CreateStepId }) {
  return step === 'color'
}

export function showsDesignRails({ step }: { step: CreateStepId }) {
  return step === 'design'
}

export function showsPreviewRails({ step }: { step: CreateStepId }) {
  return step === 'share'
}

export function showsShareRail({ step }: { step: CreateStepId }) {
  return step === 'share'
}

export function forcesClothView({ step }: { step: CreateStepId }) {
  return step !== 'design'
}

export function allowsDrawView({ step }: { step: CreateStepId }) {
  return step === 'design'
}

/** Design step shows the paint pane beside cloth; all other steps are full-bleed 3D. */
export function showsPaintPane({ step }: { step: CreateStepId }) {
  return step === 'design'
}

export function showsDualStudio({ step }: { step: CreateStepId }) {
  return step === 'design'
}
