import { COLLAR_START_Y, CURRENT_TEMPLATE } from './template-manifest'

/**
 * Faint guides over a tee's 2D panel (UI plan, step 4): where the chest sits
 * and where the collar band covers the panel and never prints. Measured on
 * the template, so they say where marks really land. Display only: never in
 * the document or a published picture.
 */
export type PanelGuides = {
  /** From the top of the panel, as a fraction of its height. */
  chestFromTop: number
  collarFromTop: number
  /** Short label for the chest line: the back has the shoulder blades there. */
  chestLabel: string
}

export function panelGuides({ panel }: { panel: string }): PanelGuides | null {
  if (panel !== 'front' && panel !== 'back') {
    return null
  }

  const { landmarks } = CURRENT_TEMPLATE.regions[panel]
  const chestY = (landmarks.chestCentre ?? landmarks.shoulderBladeCentre)?.y

  if (chestY === undefined) {
    return null
  }

  return {
    chestFromTop: 1 - chestY,
    collarFromTop: 1 - COLLAR_START_Y,
    chestLabel: panel === 'front' ? 'Chest' : 'Shoulder blades',
  }
}
