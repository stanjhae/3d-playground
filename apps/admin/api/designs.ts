import { handleAdminRequest } from '../src/server/handlers.ts'

export function GET(request: Request) {
  return handleAdminRequest({ request })
}

export function POST(request: Request) {
  return handleAdminRequest({ request })
}
