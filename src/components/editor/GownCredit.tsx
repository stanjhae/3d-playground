import { GOWN_CREDIT_HREF, GOWN_LICENSE_HREF, HOUSE_COPY } from '../../lib/house-copy'

export function GownCredit() {
  return (
    <p className="font-display text-[10px] tracking-[0.16em] text-ivory-muted uppercase">
      <a
        href={GOWN_CREDIT_HREF}
        rel="noopener noreferrer"
        target="_blank"
        className="hover:text-brass"
      >
        {HOUSE_COPY.gownCredit}
      </a>
      {' · '}
      <a
        href={GOWN_LICENSE_HREF}
        rel="license noopener noreferrer"
        target="_blank"
        className="hover:text-brass"
      >
        {HOUSE_COPY.gownLicense}
      </a>
    </p>
  )
}
