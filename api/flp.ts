import { handleFlpRequest } from '../src/lib/flp-api/server.ts'

export function GET(request: Request) {
  return handleFlpRequest({ request })
}

export function POST(request: Request) {
  return handleFlpRequest({ request })
}

export function PATCH(request: Request) {
  return handleFlpRequest({ request })
}

export function DELETE(request: Request) {
  return handleFlpRequest({ request })
}

export default {
  fetch(request: Request) {
    return handleFlpRequest({ request })
  },
}
