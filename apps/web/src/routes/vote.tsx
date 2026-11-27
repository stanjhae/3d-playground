import { createFileRoute } from '@tanstack/react-router'

import { GuestBoard } from '../components/vote/GuestBoard'
import { VoteFeed } from '../components/vote/VoteFeed'
import { AUTH_REQUIRED } from '../lib/auth/supabase-client'

export const Route = createFileRoute('/vote')({
  validateSearch: (search: Record<string, unknown>): { entered?: string; mode?: 'compare' } => ({
    ...(typeof search.entered === 'string' && search.entered.length > 0 ? { entered: search.entered } : {}),
    ...(search.mode === 'compare' ? { mode: 'compare' as const } : {}),
  }),
  // Where sign-in is required, Vote is the discover feed: designs that need
  // votes first, each with its own Vote button. The rankings are on
  // /ranking. Guest builds keep the read-only sample board.
  component: AUTH_REQUIRED ? VoteFeed : GuestVote,
})

function GuestVote() {
  const { entered } = Route.useSearch()
  return <GuestBoard entered={entered} />
}
