import {
  createStoredDesign,
  listStoredDesigns,
  parseDesignDraft,
} from '../src/lib/designs-store.ts'
import { rankDesigns } from '../src/lib/rank-designs.ts'

export function GET() {
  return Response.json({
    designs: rankDesigns({ designs: listStoredDesigns() }),
  })
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'The look could not be read' },
      { status: 400 },
    )
  }

  const draft = parseDesignDraft({ body })

  if (!draft) {
    return Response.json(
      { error: 'The look needs a title and panels' },
      { status: 400 },
    )
  }

  const design = createStoredDesign({ draft })

  return Response.json({ design }, { status: 201 })
}
