import { HOUSE_COPY } from './house-copy.ts'
import {
  DesignsBoardFullError,
  DesignsPersistError,
  createStoredDesign,
  hydrateDesignsStore,
  parseDesignDraft,
  persistDesignsStore,
  removeStoredDesign,
  restoreStoredVotes,
  voteStoredDesign,
  listStoredDesigns,
  withDesignsLock,
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

  let design

  try {
    design = createStoredDesign({ draft })
  } catch (error) {
    if (error instanceof DesignsBoardFullError) {
      return Response.json({ error: HOUSE_COPY.boardFull }, { status: 409 })
    }

    throw error
  }

  try {
    await persistDesignsStore()
  } catch (error) {
    removeStoredDesign({ id: design.id })

    if (error instanceof DesignsPersistError) {
      return Response.json(
        { error: HOUSE_COPY.boardPersistFailed },
        { status: 503 },
      )
    }

    throw error
  }

  return Response.json({ design }, { status: 201 })
}

async function voteDesignsResponse({ request }: { request: Request }) {
  const id = await resolveVoteId({ request })
  const before = listStoredDesigns().find((design) => design.id === id)
  const design = voteStoredDesign({ id })

  if (!design) {
    return Response.json({ error: 'That look is gone' }, { status: 404 })
  }

  try {
    await persistDesignsStore()
  } catch (error) {
    restoreStoredVotes({ id, votes: before?.votes ?? design.votes - 1 })

    if (error instanceof DesignsPersistError) {
      return Response.json(
        { error: HOUSE_COPY.boardPersistFailed },
        { status: 503 },
      )
    }

    throw error
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
  try {
    return await withDesignsLock({
      run: async () => {
        await hydrateDesignsStore()

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
      },
    })
  } catch {
    return Response.json({ error: HOUSE_COPY.boardFailed }, { status: 500 })
  }
}
