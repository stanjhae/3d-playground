import { withErrorReporting } from '../src/lib/error-tunnel.ts'
import { handleFlpRequest } from '../src/lib/flp-api/server.ts'

const handle = withErrorReporting((request) => handleFlpRequest({ request }))

export function GET(request: Request) {
  return handle(request)
}

export function POST(request: Request) {
  return handle(request)
}

export function PATCH(request: Request) {
  return handle(request)
}

export function DELETE(request: Request) {
  return handle(request)
}

export default {
  fetch(request: Request) {
    return handle(request)
  },
}
