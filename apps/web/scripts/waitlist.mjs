import { removeWaitlistEmail } from '../src/lib/waitlist-store.ts'

/**
 * Takes one address off the waitlist when its owner asks (Q10 #195,
 * docs/requests.md). The waitlist is one list under the KV key
 * `flv:waitlist`, so this reads and rewrites it.
 *
 *   KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/waitlist.mjs remove someone@example.com
 *   … node scripts/waitlist.mjs remove someone@example.com --confirm
 *
 * Without --confirm it only says whether the address is there.
 */

const [command, email] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const confirm = process.argv.includes('--confirm')

if (command !== 'remove' || !email) {
  console.error('Usage: KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/waitlist.mjs remove <email> [--confirm]')
  process.exit(1)
}

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('Set KV_REST_API_URL and KV_REST_API_TOKEN for the deployment whose waitlist this is.')
  process.exit(1)
}

const result = await removeWaitlistEmail({ email, dryRun: !confirm })

if (!result.ok) {
  console.error(`"${email}" isn't an email address.`)
  process.exit(1)
}

if (!result.found) {
  console.log(`${email} isn't on the waitlist (${result.count} addresses). Nothing to remove.`)
} else if (!confirm) {
  console.log(`${email} is on the waitlist (${result.count} addresses). Rerun with --confirm to remove it.`)
} else {
  console.log(`Removed ${email}. The waitlist now has ${result.count} addresses.`)
}
