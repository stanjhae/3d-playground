import { describe, expect, it } from 'vitest'

import { sectionInBand } from './use-active-section'

describe('sectionInBand', () => {
  // The band runs from 160 to 320 px in an 800 px viewport.
  it('marks the section covering most of the band, not the first that touches it', () => {
    // The live bug: Features grazed the band's top while Voting filled it.
    expect(
      sectionInBand({
        viewportHeight: 800,
        sections: [
          { id: 'features', top: -946, bottom: 192 },
          { id: 'vote', top: 192, bottom: 1006 },
        ],
      }),
    ).toBe('vote')
  })

  it('marks nothing above the first section', () => {
    expect(sectionInBand({ viewportHeight: 800, sections: [{ id: 'flow', top: 900, bottom: 1700 }] })).toBeNull()
  })
})
