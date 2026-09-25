import { garmentCredit } from '../../lib/garments'

export function GownCredit({
  garmentId,
}: {
  garmentId?: string | null
}) {
  const credit = garmentCredit({ garmentId })

  if (!credit) {
    return null
  }

  return (
    <p className="font-body text-xs tracking-[0.08em] text-flv-muted uppercase">
      <a
        href={credit.href}
        rel="noopener noreferrer"
        target="_blank"
        className="hover:text-flv-accent"
      >
        {credit.label}
      </a>
      {' · '}
      <a
        href={credit.licenseHref}
        rel="license noopener noreferrer"
        target="_blank"
        className="hover:text-flv-accent"
      >
        {credit.license}
      </a>
    </p>
  )
}
