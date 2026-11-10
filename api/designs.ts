import { handleDesignsRequest } from '../src/lib/designs-handlers.ts'
import { withErrorReporting } from '../src/lib/error-tunnel.ts'

function designsRequest({ request }: { request?: Request }) {
  return (
    request ??
    new Request('http://localhost/api/designs', {
      method: 'GET',
    })
  )
}

const handle = withErrorReporting((request) => handleDesignsRequest({ request }))

export function GET(request?: Request) {
  return handle(designsRequest({ request }))
}

export function POST(request: Request) {
  return handle(request)
}

export default {
  fetch(request: Request) {
    return handle(request)
  },
}
