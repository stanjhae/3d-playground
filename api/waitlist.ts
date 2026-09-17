import { handleWaitlistRequest } from '../src/lib/waitlist-handlers.ts'

export function POST(request: Request) {
  return handleWaitlistRequest({ request })
}

export default {
  fetch(request: Request) {
    return handleWaitlistRequest({ request })
  },
}
