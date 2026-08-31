import { resolveVoteId } from '../../../src/lib/paths'

function voteOnDesign({
  request,
  id,
}: {
  request: Request
  id: string
}) {
  return Response.json({
    id,
    votes: 0,
    method: request.method,
  })
}

export async function POST(
  request: Request,
  context: { params?: Promise<{ id: string }> | { id: string } } = {},
) {
  const id = await resolveVoteId({
    request,
    params: context.params,
  })

  return voteOnDesign({ request, id })
}
