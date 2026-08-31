export function lookIdFromPathname({ pathname }: { pathname: string }) {
  const match = /^\/look\/([^/]+)/.exec(pathname)
  return match?.[1] ?? null
}

export async function resolveVoteId({
  request,
  params,
}: {
  request: Request
  params?: Promise<{ id: string }> | { id: string }
}) {
  if (params) {
    const resolved = params instanceof Promise ? await params : params
    if (resolved.id) {
      return resolved.id
    }
  }

  const url = new URL(request.url)
  const voteId = url.searchParams.get('voteId')

  if (voteId) {
    return voteId
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const designsIndex = segments.indexOf('designs')
  const voteIndex = segments.lastIndexOf('vote')

  if (designsIndex >= 0 && voteIndex === designsIndex + 2) {
    const id = segments[designsIndex + 1]
    if (id) {
      return id
    }
  }

  return 'unknown'
}
