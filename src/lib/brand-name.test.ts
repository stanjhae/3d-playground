import { expect, test } from 'vitest'

import authConfig from '../../supabase/config.toml?raw'
import emailTemplate from '../../supabase/templates/email-code.html?raw'

/** One public name, Fashion Leader Vote (decided 4 Nov, #198). */
const OLD_NAME = ['Fashion', 'Leaderboard'].join(' ')

test('the old name stays out of the app and its emails', () => {
  const sources = import.meta.glob('/src/**/*.{ts,tsx,html,css}', { query: '?raw', import: 'default', eager: true })
  const files = { ...sources, 'supabase/config.toml': authConfig, 'supabase/templates/email-code.html': emailTemplate }
  const found = Object.entries(files).filter(([, text]) => (text as string).includes(OLD_NAME)).map(([name]) => name)

  expect(found).toEqual([])
})

test('the sign-in email uses the public name', () => {
  expect(emailTemplate).toContain('Fashion Leader Vote')
  expect(authConfig).toContain('subject = "Your Fashion Leader Vote sign-in code"')
})

test('the sign-in email promises what sign-in does: a 6-digit code that expires in 10 minutes', () => {
  expect(authConfig).toMatch(/^otp_length = 6$/m)
  expect(authConfig).toMatch(/^otp_expiry = 600$/m)
  expect(emailTemplate).toContain('expires in 10 minutes')
})
