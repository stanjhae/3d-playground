import { describe, expect, it } from 'vitest'

import type { DesignDocument } from './design-document'
import { publishTitleLead, suggestedPublishTags, type PublishFacts } from './publish-suggestions'

const text = (content: string, visible = true) =>
  ({ id: content, kind: 'text', content, visible }) as unknown as DesignDocument['layers'][number]

const facts = (over: Partial<PublishFacts> = {}): PublishFacts => ({
  garmentId: 'tee',
  fabricId: null,
  bodyColor: null,
  layers: [],
  ...over,
})

describe('publishTitleLead', () => {
  it('names the chosen cloth and colour, not a fixed fabric', () => {
    expect(publishTitleLead({ facts: facts({ fabricId: 'linen', bodyColor: '#F4EAD4' }) })).toBe('Ivory Linen')
    expect(publishTitleLead({ facts: facts({ fabricId: 'denim' }) })).toBe('Denim')
  })

  it('falls back to the garment with no cloth chosen', () => {
    expect(publishTitleLead({ facts: facts() })).toBe('Tee')
    expect(publishTitleLead({ facts: facts({ bodyColor: '#111318' }) })).toBe('Night Tee')
    expect(publishTitleLead({ facts: facts({ bodyColor: '#123456' }) })).toBe('Tee')
  })
})

describe('suggestedPublishTags', () => {
  it('suggests the colour, cloth, garment and the design’s own words', () => {
    expect(
      suggestedPublishTags({
        facts: facts({ fabricId: 'silk', bodyColor: '#6b1d2a', layers: [text('Hello, Lagos!'), text('hidden', false)] }),
      }),
    ).toEqual(['oxblood', 'silk', 'tee', 'hello', 'lagos'])
  })

  it('drops short words and duplicates and keeps at most six', () => {
    expect(
      suggestedPublishTags({ facts: facts({ layers: [text('a TEE tee of one two three four five')] }) }),
    ).toEqual(['tee', 'one', 'two', 'three'])
    expect(
      suggestedPublishTags({
        facts: facts({ fabricId: 'wool', bodyColor: '#c4a15a', layers: [text('alpha beta gamma delta')] }),
      }),
    ).toHaveLength(6)
  })
})
