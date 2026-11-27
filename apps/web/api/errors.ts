import { handleErrorsRequest } from '../src/lib/error-tunnel.ts'

export function POST(request: Request) {
  return handleErrorsRequest({ request })
}

export default {
  fetch(request: Request) {
    return handleErrorsRequest({ request })
  },
}
