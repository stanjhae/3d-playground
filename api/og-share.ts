import { handleSharePage } from '../src/lib/flp-api/share-page.ts'

export function GET(request: Request) {
  return handleSharePage({ request })
}

export default {
  fetch(request: Request) {
    return handleSharePage({ request })
  },
}
