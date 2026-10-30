/**
 * Where people report a published design or ask for account deletion
 * (Q10 #195). Set per environment; without it the app says reporting is
 * not open yet rather than linking nowhere.
 */
export const CONTACT_EMAIL: string | null = import.meta.env.VITE_FLP_CONTACT_EMAIL?.trim() || null

export function reportDesignHref({ slug, email = CONTACT_EMAIL }: { slug: string; email?: string | null }) {
  if (!email) {
    return null
  }

  const subject = encodeURIComponent(`Report shared design ${slug}`)
  const body = encodeURIComponent(
    `Link: ${typeof window === 'undefined' ? '' : window.location.origin}/s/${slug}\n\nWhat is wrong with this design?\n`,
  )
  return `mailto:${email}?subject=${subject}&body=${body}`
}
