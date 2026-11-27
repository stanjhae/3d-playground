import { withErrorReporting } from '../src/lib/error-tunnel.ts'
import { handleEventsRequest } from '../src/lib/waitlist-handlers.ts'

const handle = withErrorReporting((request) => handleEventsRequest({ request }))

export function POST(request: Request) {
  return handle(request)
}

export default {
  fetch(request: Request) {
    return handle(request)
  },
}
