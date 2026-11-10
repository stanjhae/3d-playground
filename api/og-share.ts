import { withErrorReporting } from '../src/lib/error-tunnel.ts'
import { handleSharePage } from '../src/lib/flp-api/share-page.ts'

const handle = withErrorReporting((request) => handleSharePage({ request }))

export function GET(request: Request) {
  return handle(request)
}

export default {
  fetch(request: Request) {
    return handle(request)
  },
}
