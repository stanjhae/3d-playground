export function overrideMatchesMesh({
  meshName,
  nodeName,
  ancestorNames,
}: {
  meshName: string
  nodeName: string
  ancestorNames?: string[]
}) {
  if (nodeName === meshName) {
    return true
  }

  if (nodeName.startsWith(`${meshName}-`)) {
    return true
  }

  return (ancestorNames ?? []).includes(meshName)
}
