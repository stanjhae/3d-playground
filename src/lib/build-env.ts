/**
 * A deployed build must be able to take reports of shared designs, so it
 * stops here rather than ship without an address. Local and CI builds may
 * leave it unset; `pnpm demo:preflight` checks the demo's.
 */
export function assertDeployEnv({ env }: { env: Record<string, string | undefined> }) {
  if (env.VERCEL && !env.VITE_FLP_CONTACT_EMAIL?.trim()) {
    throw new Error(
      'VITE_FLP_CONTACT_EMAIL is required for a deployed build: it receives reports of shared designs and account-deletion requests. Set it in the Vercel project.',
    )
  }
}
