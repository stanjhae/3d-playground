import { handleEventsRequest } from '../src/lib/waitlist-handlers.ts'

export function POST(request: Request) {
  return handleEventsRequest({ request })
}

export default {
  fetch(request: Request) {
    return handleEventsRequest({ request })
  },
}
