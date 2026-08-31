import { handleDesignsRequest } from '../src/lib/designs-handlers.ts'

function designsRequest({ request }: { request?: Request }) {
  return (
    request ??
    new Request('http://localhost/api/designs', {
      method: 'GET',
    })
  )
}

export function GET(request?: Request) {
  return handleDesignsRequest({
    request: designsRequest({ request }),
  })
}

export function POST(request: Request) {
  return handleDesignsRequest({ request })
}

export default {
  fetch(request: Request) {
    return handleDesignsRequest({ request })
  },
}
