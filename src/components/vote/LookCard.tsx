export function LookCard({
  lookId,
  title,
}: {
  lookId: string
  title?: string
}) {
  return (
    <article>
      <p>{title ?? lookId}</p>
    </article>
  )
}
