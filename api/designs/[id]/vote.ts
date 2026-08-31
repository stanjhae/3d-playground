import { voteStoredDesign } from '../../../src/lib/designs-store.ts'
import { resolveVoteId } from '../../../src/lib/paths.ts'

export async function POST(
  request: Request,
  context: { params?: Promise<{ id: string }> | { id: string } } = {},
) {
  const id = await resolveVoteId({
    request,
    params: context.params,
  })
  const design = voteStoredDesign({ id })

  if (!design) {
    return Response.json({ error: 'That look is gone' }, { status: 404 })
  }

  return Response.json({
    id: design.id,
    votes: design.votes,
  })
}
