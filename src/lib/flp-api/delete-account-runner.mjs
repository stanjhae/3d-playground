// Runs scripts/delete-account.mjs as an operator would, for
// delete-account.integration.test.ts (A07 #151). Plain JavaScript because
// the src tsconfig has no Node types; types are in the .d.mts.

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export { listFilesUnder } from '../../../scripts/storage-tree.mjs'

const SCRIPT = fileURLToPath(new URL('../../../scripts/delete-account.mjs', import.meta.url))
const CLEANUP = fileURLToPath(new URL('../../../scripts/cleanup-orphans.mjs', import.meta.url))
const FAULTS = fileURLToPath(new URL('./delete-account-faults.mjs', import.meta.url))

/** `cleanup-orphans.mjs` without `--delete`: lists what it would remove, and removes nothing. */
export function runCleanupDryRun({ url, secretKey }) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLEANUP],
      { env: { PATH: process.env.PATH, SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey }, maxBuffer: 1 << 26 },
      (error, stdout, stderr) => {
        resolve({ code: error ? Number(error.code ?? 1) : 0, output: `${stdout}${stderr}` })
      },
    )
  })
}

/** `delete-account.mjs <email> --confirm`, with one injected fault if `failAt` is set. */
export function runDeleteAccount({ email, url, secretKey, failAt }) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [...(failAt ? ['--import', FAULTS] : []), SCRIPT, email, '--confirm'],
      {
        env: {
          PATH: process.env.PATH,
          SUPABASE_URL: url,
          SUPABASE_SECRET_KEY: secretKey,
          ...(failAt ? { FLP_FAIL_AT: failAt } : {}),
        },
      },
      (error, stdout, stderr) => {
        resolve({ code: error ? Number(error.code ?? 1) : 0, output: `${stdout}${stderr}` })
      },
    )
  })
}
