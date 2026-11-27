import { describe, expect, test } from 'vitest'

import { handleHealthRequest } from './health'

describe('GET /api/health', () => {
  test('reports each admin-visible flag as on or off, and no other env value', async () => {
    const response = await handleHealthRequest({
      request: new Request('http://localhost/api/health'),
      env: { VITE_PATTERN_BETA: 'true', FLP_AI_ASSIST: 'yes', ANTHROPIC_API_KEY: 'sk-secret' },
    })
    const body = await response.json()

    expect(body.flags).toEqual({ VITE_PATTERN_BETA: true, VITE_AI_ASSIST: false, FLP_AI_ASSIST: false })
    expect(JSON.stringify(body)).not.toContain('sk-secret')
  })
})
