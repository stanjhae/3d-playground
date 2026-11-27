import { describe, expect, test } from 'vitest'

import vercelConfig from '../../vercel.json' with { type: 'json' }

/**
 * Every function loads its handler from `src/lib` at run time, so a pattern
 * that matches nothing only shows on a deployment, as a crash on every call.
 */
describe('vercel.json functions', () => {
  const functions = Object.entries(vercelConfig.functions)

  test.each(functions)('%s ships src/lib', (_, { includeFiles }) => {
    const patterns = includeFiles.replace(/^\{(.*)\}$/, '$1').split(',')
    expect(patterns).toContain('src/lib/**')
  })

  // Glob tools don't expand `{a}`: it looks for a file literally named that.
  test.each(functions)('%s has no one-item brace', (_, { includeFiles }) => {
    expect(includeFiles).not.toMatch(/\{[^,{}]*\}/)
  })
})
