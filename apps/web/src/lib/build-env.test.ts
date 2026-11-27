import { describe, expect, test } from 'vitest'

import { assertDeployEnv } from './build-env'

describe('assertDeployEnv', () => {
  test('a deployed build needs the contact address', () => {
    expect(() => assertDeployEnv({ env: { VERCEL: '1' } })).toThrow('VITE_FLP_CONTACT_EMAIL')
    expect(() => assertDeployEnv({ env: { VERCEL: '1', VITE_FLP_CONTACT_EMAIL: '  ' } })).toThrow('VITE_FLP_CONTACT_EMAIL')
  })

  test('a deployed build with it is fine', () => {
    expect(() => assertDeployEnv({ env: { VERCEL: '1', VITE_FLP_CONTACT_EMAIL: 'a@b.test' } })).not.toThrow()
  })

  test('local and CI builds may leave it unset', () => {
    expect(() => assertDeployEnv({ env: {} })).not.toThrow()
  })
})
