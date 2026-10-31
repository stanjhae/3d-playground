/**
 * Browser security headers (Q02 #187), the one source for `vercel.json`
 * and the Vite dev and preview servers. `vercel.json` can't import code,
 * so `security-headers.test.ts` fails when its copy drifts from this file;
 * rewrite it with `node scripts/security-headers.mjs`.
 */

/**
 * Supabase hosts in the deployed policy. `vercel.json` is shared by every
 * environment and each has its own project, so the header allows any
 * project; the built page then narrows that to the configured
 * `VITE_SUPABASE_URL` with {@link supabaseMetaPolicy}.
 */
export const DEPLOYED_SUPABASE_SOURCE = 'https://*.supabase.co'

/** The origin of a configured Supabase URL, or null when unset or invalid. */
export function supabaseOrigin({ url }: { url?: string | null }) {
  if (!url) {
    return null
  }

  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * The Content-Security-Policy. `supabase` is the source the browser may
 * call and load images from (auth, uploads, signed render URLs).
 * `devNonce` is only for the Vite dev server, which injects its React
 * refresh preamble and CSS as inline tags; the policy is otherwise the same.
 */
export function contentSecurityPolicy({ supabase, devNonce }: { supabase: string | null; devNonce?: string }) {
  const remote = supabase ? [supabase] : []
  const nonce = devNonce ? [`'nonce-${devNonce}'`] : []
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    // drei's Draco decoder (the compressed garments) is WebAssembly, and
    // compiling it needs 'wasm-unsafe-eval'. 'unsafe-eval' stays off:
    // nothing here evals JavaScript.
    ['script-src', ["'self'", "'wasm-unsafe-eval'", ...nonce]],
    ['style-src', ["'self'", ...nonce]],
    ['img-src', ["'self'", 'data:', 'blob:', ...remote]],
    ['font-src', ["'self'", 'data:']],
    // GLTFLoader fetches a model's embedded textures from blob: URLs.
    ['connect-src', ["'self'", 'blob:', ...remote]],
    // drei runs the Draco decoder in workers built from blob: URLs.
    ['worker-src', ["'self'", 'blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]

  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

/**
 * The narrower policy the built page adds as a `<meta>`. Browsers enforce
 * every policy they get, so the effective Supabase source is the
 * configured project only.
 */
export function supabaseMetaPolicy({ supabase }: { supabase: string }) {
  return `img-src 'self' data: blob: ${supabase}; connect-src 'self' blob: ${supabase}`
}

export function securityHeaders({ supabase, devNonce }: { supabase: string | null; devNonce?: string }) {
  return {
    'Content-Security-Policy': contentSecurityPolicy({ supabase, devNonce }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy':
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()',
  }
}

/** The `headers` entry `vercel.json` must contain. */
export function vercelHeaders() {
  return [
    {
      source: '/(.*)',
      headers: Object.entries(securityHeaders({ supabase: DEPLOYED_SUPABASE_SOURCE })).map(([key, value]) => ({
        key,
        value,
      })),
    },
  ]
}
