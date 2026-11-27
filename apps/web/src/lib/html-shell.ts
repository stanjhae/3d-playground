/**
 * String surgery on the built app shell, shared by the share page
 * (`/s/:slug`) and the landing prerender. Pure, so both are tested directly.
 */

/** JSON that can sit inside a `<script type="application/json">` safely. */
export function embeddedJson({ value }: { value: unknown }) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(' ')
    .join('\\u2028')
    .split(' ')
    .join('\\u2029')
}

export function escapeHtml({ value }: { value: string }) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Drops the shell's site-wide title, description, social tags and any
 * canonical, and puts `head` at the end of <head> instead.
 */
export function replaceSiteHead({ shell, head }: { shell: string; head: string }) {
  const stripped = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\b[^>]*\b(?:property="og:[^"]*"|name="(?:twitter:[^"]*|description)")[^>]*>/gi, '')
    .replace(/<link\b[^>]*\brel="canonical"[^>]*>/gi, '')

  return stripped.replace(/<\/head>/i, `${head}\n  </head>`)
}

/** Puts `html` immediately before the empty app root. */
export function injectBeforeRoot({ shell, html }: { shell: string; html: string }) {
  if (!/<div id="root"><\/div>/.test(shell)) {
    throw new Error('The app shell has no empty #root')
  }

  return shell.replace(/<div id="root"><\/div>/, `${html}<div id="root"></div>`)
}
