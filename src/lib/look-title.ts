export function formatLookTitle({
  fabricName,
  serial,
}: {
  fabricName: string
  serial: number
}) {
  return `${fabricName} ${String(serial).padStart(2, '0')}`
}

export function resolveDraftTitle({
  title,
  storeTitle,
  fabricName,
  serial,
}: {
  title?: string
  storeTitle?: string
  fabricName: string
  serial: number
}) {
  return title || storeTitle || formatLookTitle({ fabricName, serial })
}
