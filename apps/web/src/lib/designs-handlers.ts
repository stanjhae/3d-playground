import { HOUSE_COPY } from './house-copy.ts'
import {
  DesignsBoardFullError,
  DesignsPersistError,
  createStoredDesign,
  getStoredDesign,
  hydrateDesignsStore,
  parseDesignDraft,
  persistDesignsStore,
  removeStoredDesign,
  listStoredDesigns,
  withDesignsLock,
} from './designs-store.ts'
import { isLinkVisibleLook } from './design-schema.ts'
import { rankDesigns } from './rank-designs.ts'

/** Guest voting is retired (V1): votes are by account, on shared designs. */
export const GUEST_VOTE_RETIRED =
  'Guest voting has ended. Sign in and vote on a shared design.'

/**
 * The guest board takes no new looks or votes wherever the alpha requires
 * sign-in (F09 #144): the same rule as `AUTH_REQUIRED` in the browser,
 * enforced here so hiding the UI is not the only guard. Reads stay open
 * for links that already exist.
 */
export function guestBoardClosed({
  env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {},
}: {
  env?: Record<string, string | undefined>
} = {}) {
  const supabase = Boolean(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  return supabase && env.VITE_FLP_REQUIRE_AUTH !== 'false'
}

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

function listDesignsResponse({ request }: { request: Request }) {
  const lookId = new URL(request.url).searchParams.get('lookId')?.trim()

  if (lookId) {
    const design = getStoredDesign({ id: lookId })

    if (!design || !isLinkVisibleLook({ design })) {
      return Response.json({ error: 'That look is gone' }, { status: 404 })
    }

    return Response.json({ design })
  }

  return Response.json({
    designs: rankDesigns({
      designs: listStoredDesigns({ boardOnly: true }),
    }),
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
          return listDesignsResponse({ request })
        }

        // Retired everywhere, before the board-closed check, so no guest
        // vote is ever counted again.
        if (request.method === 'POST' && isVote) {
          return Response.json({ error: GUEST_VOTE_RETIRED }, { status: 410 })
        }

        if (request.method === 'POST' && guestBoardClosed()) {
          return Response.json(
            { error: 'Posting to the guest board is closed. Sign in and publish from My Studio.' },
            { status: 403 },
          )
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
