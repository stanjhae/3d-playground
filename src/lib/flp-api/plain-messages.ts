/**
 * What people read when an API call fails. Codes and database wording are
 * for logs: a message that is one of those is replaced by a plain sentence
 * for its kind of failure, and anything already written for people is kept.
 */

export const PLAIN_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Your session ended. Sign in again.',
  not_found: 'That could not be found. It may have been deleted.',
  conflict: 'This changed somewhere else. Reload the page and try again.',
  too_large: 'That is too large to save.',
  invalid: 'That could not be saved because something in it isn’t valid.',
  quota_exceeded: 'This account has reached a limit. Delete something you no longer need and try again.',
  rate_limited: 'Too many requests. Wait a few seconds and try again.',
  taken_down: 'This design was taken down after a report, so it can’t be published. Your design itself is kept. Contact us if you think this is a mistake.',
  internal: 'Something went wrong on our side. Try again.',
  unavailable: 'This isn’t available right now. Try again later.',
}

const FALLBACK = PLAIN_ERROR_MESSAGES.internal!

/** Wording from the database or request checks that means nothing to people. */
const TECHNICAL = new Set([
  'conflict',
  'cross-origin requests are not allowed',
  'method not allowed',
  'mutation key already used',
  'mutation key reused with different content',
  'request body is not json',
  'request is invalid',
  'stale base version',
  'unsupported save kind',
])

function isTechnical({ message }: { message: string }) {
  const lower = message.trim().toLowerCase()
  return !lower || TECHNICAL.has(lower) || /^[a-z0-9]+([_-][a-z0-9]+)+$/.test(lower) || lower in PLAIN_ERROR_MESSAGES
}

export function plainApiMessage({
  code,
  message,
  retryAfter,
}: {
  code: string
  message: string | undefined
  retryAfter?: number
}) {
  // The server's own text promises a retry only a background save makes.
  if (code === 'rate_limited') {
    return retryAfter && retryAfter > 0
      ? `Too many requests. Wait ${retryAfter} ${retryAfter === 1 ? 'second' : 'seconds'} and try again.`
      : PLAIN_ERROR_MESSAGES.rate_limited!
  }

  if (message === undefined || isTechnical({ message })) {
    return PLAIN_ERROR_MESSAGES[code] ?? FALLBACK
  }

  const trimmed = message.trim()
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** "Not renamed. Too many requests." One sentence each, however the reason ends. */
export function failureSentence({ lead, reason }: { lead: string; reason: string }) {
  return `${lead}. ${/[.!?]$/.test(reason) ? reason : `${reason}.`}`
}
