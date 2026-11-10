import { Link } from '@tanstack/react-router'

import { CONTACT_EMAIL } from '../../lib/alpha-contact'
import { FLV_COPY } from '../../lib/flv-copy'

const linkClass = 'inline-flex min-h-11 items-center underline-offset-4 hover:text-flv-accent hover:underline'

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 border-t border-flv-line bg-flv-paper px-4 py-2 font-body text-xs text-flv-muted sm:px-6">
      <p>{FLV_COPY.brand} is an early alpha.</p>
      <p className="flex gap-4">
        <Link to="/privacy" className={linkClass}>
          Privacy
        </Link>
        <Link to="/terms" className={linkClass}>
          Terms
        </Link>
        {CONTACT_EMAIL ? (
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
            Contact
          </a>
        ) : null}
      </p>
    </footer>
  )
}
