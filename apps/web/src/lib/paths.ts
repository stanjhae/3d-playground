export const HOUSE_LOOK_FALLBACK_ID = 'look-midnight-silk'

export function lookIdFromPathname({ pathname }: { pathname: string }) {
  const match = /^\/look\/([^/]+)/.exec(pathname)
  return match?.[1] ?? null
}
