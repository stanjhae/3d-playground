import {
  createStoredDesign,
  parseDesignDraft,
  voteStoredDesign,
  listStoredDesigns,
} from './designs-store.ts'
import { resolveVoteId } from './paths.ts'
import { rankDesigns } from './rank-designs.ts'

function isVoteRequest({ request }: { request: Request }) {
  const url = new URL(request.url)

  if (url.searchParams.get('voteId')) {
    return true
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const designsIndex = segments.indexOf('designs')
  const voteIndex = segments.lastIndexOf('vote')

  return designsIndex >= 0 && voteIndex === designsIndex + 2
}

function listDesignsResponse() {
  return Response.json({
    designs: rankDesigns({ designs: listStoredDesigns() }),
  })
}

async function createDesignsResponse({ request }: { request: Request }) {
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

async function voteDesignsResponse({ request }: { request: Request }) {
  const id = await resolveVoteId({ request })
  const design = voteStoredDesign({ id })

  if (!design) {
    return Response.json({ error: 'That look is gone' }, { status: 404 })
  }

  return Response.json({
    id: design.id,
    votes: design.votes,
  })
}

export async function handleDesignsRequest({
  request,
}: {
  request: Request
}) {
  const { pathname } = new URL(request.url)
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const isVote = isVoteRequest({ request })

  if (request.method === 'GET' && !isVote) {
    return listDesignsResponse()
  }

  if (request.method === 'POST' && isVote) {
    return voteDesignsResponse({ request })
  }

  if (request.method === 'POST' && normalizedPath.endsWith('/api/designs')) {
    return createDesignsResponse({ request })
  }

  return Response.json({ error: 'Not found' }, { status: 404 })
}
