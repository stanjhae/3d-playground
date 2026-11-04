import type { CreateStepId } from './create-steps'
import { FLV_COPY } from './flv-copy'

import { CONCEPT_FEATURES } from './concept-flags'
export type LandingStageId = CreateStepId | 'vote'

export const LANDING_STAGE_IDS: readonly LandingStageId[] = [
  'select',
  'fit',
  'color',
  'design',
  'preview',
  'share',
  'vote',
] as const

/** The board shows sample looks and creators, so it's a concept (#199, #138). */
export const VISIBLE_LANDING_STAGE_IDS = CONCEPT_FEATURES
  ? LANDING_STAGE_IDS
  : LANDING_STAGE_IDS.filter((stage) => stage !== 'vote')

export const LANDING_RAIL: readonly {
  id: LandingStageId
  label: string
}[] = [
  { id: 'select', label: FLV_COPY.stageGarment },
  { id: 'design', label: FLV_COPY.stageDesign },
  { id: 'preview', label: FLV_COPY.stageTryShare },
] as const

export function landingStageTitle({
  stage,
}: {
  stage: LandingStageId
}) {
  switch (stage) {
    case 'select':
      return FLV_COPY.selectTitle
    case 'fit':
      return FLV_COPY.fitTitle
    case 'color':
      return FLV_COPY.colorTitle
    case 'design':
      return FLV_COPY.designTitle
    case 'preview':
      return FLV_COPY.previewTitle
    case 'share':
      return FLV_COPY.shareTitle
    case 'vote':
      return FLV_COPY.voteTitle
  }
}

export function landingStageLead({
  stage,
}: {
  stage: LandingStageId
}) {
  switch (stage) {
    case 'select':
      return FLV_COPY.selectLead
    case 'fit':
      return FLV_COPY.fitLead
    case 'color':
      return FLV_COPY.colorLead
    case 'design':
      return FLV_COPY.designLead
    case 'preview':
      return FLV_COPY.previewLead
    case 'share':
      return FLV_COPY.shareLead
    case 'vote':
      return FLV_COPY.voteLead
  }
}

export function landingStageChip({
  stage,
}: {
  stage: LandingStageId
}) {
  switch (stage) {
    case 'select':
      return 'Select'
    case 'fit':
      return 'Fit'
    case 'color':
      return 'Color'
    case 'design':
      return 'Design'
    case 'preview':
      return 'Preview'
    case 'share':
      return 'Share'
    case 'vote':
      return 'Vote'
  }
}

export function isCreateLandingStage(
  stage: LandingStageId,
): stage is CreateStepId {
  return stage !== 'vote'
}
