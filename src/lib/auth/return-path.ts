/**
 * Where to go after sign-in (A02 #146). Only same-origin paths survive:
 * absolute URLs, protocol-relative `//host`, backslash tricks, control
 * characters and the sign-in page itself fall back to the default.
 */

export const DEFAULT_RETURN_PATH = '/create'

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export function safeReturnPath({ value }: { value: unknown }) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    return DEFAULT_RETURN_PATH
  }

  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return DEFAULT_RETURN_PATH
  }

  let url: URL

  try {
    url = new URL(value, 'https://flp.invalid')
  } catch {
    return DEFAULT_RETURN_PATH
  }

  if (url.origin !== 'https://flp.invalid' || url.pathname.startsWith('/sign-in')) {
    return DEFAULT_RETURN_PATH
  }

  return `${url.pathname}${url.search}${url.hash}`
}
