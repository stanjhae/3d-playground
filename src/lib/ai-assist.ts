import { call } from './flp-api/client.ts'
import type { PatternOp } from './pattern/pattern-ops.ts'

/**
 * The studio's side of the AI assist: off unless the build sets
 * `VITE_AI_ASSIST=true` (and the server has `FLP_AI_ASSIST`). Sends a
 * sketch and/or words; gets back bounded pattern edits to preview.
 */
export const AI_ASSIST = import.meta.env.VITE_AI_ASSIST === 'true'

const MAX_SIDE = 1024

/** A sketch as a JPEG no bigger than 1024 px on its long side, base64. */
export async function prepareSketch(file: Blob): Promise<{ mediaType: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')!
  // White behind a transparent sketch, so lines stay visible as JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

export async function askForEdits({
  template,
  prompt,
  image,
}: {
  template: { id: string; version: number }
  prompt: string
  image: { mediaType: 'image/jpeg'; data: string } | null
}) {
  return call<{ ops: PatternOp[]; notes: string }>({ path: 'ai/sketch', method: 'POST', body: { template, prompt, image } })
}
