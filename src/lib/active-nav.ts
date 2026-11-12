export type NavTab = 'home' | 'create' | 'studio' | 'vote' | 'look'

/**
 * Which main tab the page belongs to, so the header can mark it as the
 * steps bar marks its step. Starting a design (`/studio?new=1`, where
 * Create lands) and editing one (`/create?cloud=…`) are Create; the
 * library of saved designs is My Studio; a share page is part of Vote.
 */
export function activeNav({ pathname, search = {} }: { pathname: string; search?: Record<string, unknown> }): NavTab | null {
  if (pathname === '/') {
    return 'home'
  }

  if (pathname === '/create' || pathname.startsWith('/create/')) {
    return 'create'
  }

  if (pathname === '/studio') {
    return search.new ? 'create' : 'studio'
  }

  if (pathname === '/vote' || pathname.startsWith('/s/')) {
    return 'vote'
  }

  if (pathname.startsWith('/look/')) {
    return 'look'
  }

  return null
}
