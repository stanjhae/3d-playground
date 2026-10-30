import { useLocation, useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { AUTH_REQUIRED } from '../../lib/auth/supabase-client'

/**
 * Sends a signed-out visitor to sign-in when the studio requires an
 * account, including when a session expires mid-edit. The editor store is
 * left in memory so the same account picks up where it left off.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status)
  const location = useLocation()
  const router = useRouter()
  const blocked = AUTH_REQUIRED && status !== 'signed-in'

  useEffect(() => {
    if (AUTH_REQUIRED && (status === 'signed-out' || status === 'unavailable')) {
      void router.navigate({
        to: '/sign-in',
        search: { returnTo: location.href },
      })
    }
  }, [status, location.href, router])

  return blocked ? null : children
}
