import { createFileRoute } from '@tanstack/react-router'

import { GuestBoard } from '../components/vote/GuestBoard'
import { PublicationBoard } from '../components/vote/PublicationBoard'
import { AUTH_REQUIRED } from '../lib/auth/supabase-client'

export const Route = createFileRoute('/ranking')({
  // Where sign-in is required the board ranks published designs by counted
  // votes, by period and garment (V2). Guest builds keep the sample board.
  component: AUTH_REQUIRED ? PublicationBoard : () => <GuestBoard />,
})
