function listDesigns({ request }: { request: Request }) {
  return Response.json({
    designs: [],
    method: request.method,
  })
}

function createDesign({ request }: { request: Request }) {
  return Response.json(
    {
      ok: true,
      method: request.method,
    },
    { status: 201 },
  )
}

export function GET(request: Request) {
  return listDesigns({ request })
}

export function POST(request: Request) {
  return createDesign({ request })
}
