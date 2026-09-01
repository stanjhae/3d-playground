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
    <p className="font-display text-[10px] tracking-[0.16em] text-ivory-muted uppercase">
      <a
        href={credit.href}
        rel="noopener noreferrer"
        target="_blank"
        className="hover:text-brass"
      >
        {credit.label}
      </a>
      {' · '}
      <a
        href={credit.licenseHref}
        rel="license noopener noreferrer"
        target="_blank"
        className="hover:text-brass"
      >
        {credit.license}
      </a>
    </p>
  )
}
