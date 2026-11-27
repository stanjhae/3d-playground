import { withErrorReporting } from '../src/lib/error-tunnel.ts'
import { handleWaitlistRequest } from '../src/lib/waitlist-handlers.ts'

const handle = withErrorReporting((request) => handleWaitlistRequest({ request }))

export function POST(request: Request) {
  return handle(request)
}

export default {
  fetch(request: Request) {
    return handle(request)
  },
}
