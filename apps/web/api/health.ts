import { withErrorReporting } from '../src/lib/error-tunnel.ts'
import { handleHealthRequest } from '../src/lib/health.ts'

const handle = withErrorReporting((request) => handleHealthRequest({ request }))

export function GET(request: Request) {
  return handle(request)
}

export default {
  fetch(request: Request) {
    return handle(request)
  },
}
