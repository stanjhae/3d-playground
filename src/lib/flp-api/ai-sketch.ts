import Anthropic from '@anthropic-ai/sdk'

import { validateImage } from '../image-validate.ts'
import { PATTERN_ROLES } from '../pattern/pattern-document.ts'
import {
  CUTOUT_OFFSET_LIMITS,
  CUTOUT_SHAPES,
  PATTERN_OPS,
  PATTERN_OP_LIMITS,
  type PatternOp,
  clampPatternOp,
  isPatternOp,
  slitSeams,
} from '../pattern/pattern-ops.ts'
import type { PatternTemplate } from '../pattern/templates.ts'

/**
 * The AI assist (Workflow 1, Tier 3): a sketch or a few words in, bounded
 * pattern edits out. Claude never draws an outline; it picks from the same
 * operators the quick-edit sliders use, within their limits, and the
 * studio applies them through the same checks as a hand edit. Off unless
 * the server has `FLP_AI_ASSIST=true` and `ANTHROPIC_API_KEY` (and the
 * studio `VITE_AI_ASSIST=true`). Nothing sent is stored.
 */

export type AiEnv = {
  apiKey: string
  /** Default `claude-opus-5-5`. */
  model: string
  /** Sketches per account per day. */
  dailyLimit: number
}

export const AI_LIMITS = {
  promptChars: 500,
  /** Decoded sketch bytes; the studio downscales to 1024 px first. */
  imageBytes: 1_572_864,
  ops: 12,
  notesChars: 200,
  perMinute: 5,
} as const

export const DEFAULT_AI_MODEL = 'claude-opus-5-5'

/** The server's AI settings, or null when the assist is off. */
export function aiEnv(source: Record<string, string | undefined>): AiEnv | null {
  if (source.FLP_AI_ASSIST !== 'true' || !source.ANTHROPIC_API_KEY) {
    return null
  }

  const daily = Number(source.FLP_AI_DAILY_LIMIT ?? 30)
  return {
    apiKey: source.ANTHROPIC_API_KEY,
    model: source.FLP_AI_MODEL || DEFAULT_AI_MODEL,
    dailyLimit: Number.isInteger(daily) && daily > 0 ? daily : 30,
  }
}

export type AiSketchRequest = {
  template: { id: string; version: number }
  prompt: string
  image: { mediaType: 'image/png' | 'image/jpeg'; data: string } | null
}

export type AiSketchResponse = { ops: PatternOp[]; notes: string }

export type AiResult =
  | { ok: true; body: AiSketchResponse }
  | { ok: false; status: 404 | 422 | 502 | 503 | 504; code: string; message: string }

const fail = (status: 404 | 422 | 502 | 503 | 504, code: string, message: string): AiResult => ({ ok: false, status, code, message })

/** Checks the request's shape; the image's bytes are checked separately. */
export function parseAiRequest(value: unknown): { ok: true; request: AiSketchRequest } | { ok: false; message: string } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, message: 'Expected a JSON object' }
  }

  const body = value as Record<string, unknown>
  const template = body.template as { id?: unknown; version?: unknown } | undefined

  if (typeof template?.id !== 'string' || typeof template.version !== 'number') {
    return { ok: false, message: 'Name the garment template' }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''

  if (prompt.length > AI_LIMITS.promptChars) {
    return { ok: false, message: `Describe it in ${AI_LIMITS.promptChars} characters or fewer` }
  }

  let image: AiSketchRequest['image'] = null

  if (body.image !== undefined && body.image !== null) {
    const raw = body.image as { mediaType?: unknown; data?: unknown }

    if ((raw.mediaType !== 'image/png' && raw.mediaType !== 'image/jpeg') || typeof raw.data !== 'string') {
      return { ok: false, message: 'A sketch must be a PNG or JPEG' }
    }

    if ((raw.data.length * 3) / 4 > AI_LIMITS.imageBytes) {
      return { ok: false, message: 'The sketch is too large' }
    }

    image = { mediaType: raw.mediaType, data: raw.data }
  }

  if (!prompt && !image) {
    return { ok: false, message: 'Add a sketch or a description' }
  }

  return { ok: true, request: { template: { id: template.id, version: template.version }, prompt, image } }
}

/** The JSON schema Claude's answer must follow (structured outputs). */
export const AI_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: [...PATTERN_OPS] },
          mm: { type: 'integer' },
          side: { type: 'string', enum: ['left', 'right', 'both'] },
          // hemCurve: front, back or all; slit and cutout: a piece id. `cleanOps` checks which.
          piece: { type: 'string' },
          seam: { type: 'string' },
          // cutout only; it has no `mm`.
          shape: { type: 'string', enum: [...CUTOUT_SHAPES] },
          at: { type: 'string', enum: ['centre', ...PATTERN_ROLES] },
          dx: { type: 'integer' },
          dy: { type: 'integer' },
          wMm: { type: 'integer' },
          hMm: { type: 'integer' },
        },
        required: ['op'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['ops', 'notes'],
} as const

/** What the garment is made of, in words Claude can act on. */
function garmentSummary(template: PatternTemplate) {
  const lines = template.pattern.pieces.map((piece) => {
    const roles = Object.keys(piece.roles ?? {}).join(', ')
    const seams = slitSeams({ pattern: template.pattern, pieceId: piece.id }).map((seam) => seam.id)
    return [
      `- ${piece.label} (${piece.place.anchor}${piece.mirrorOf ? ', mirrors its pair' : ''}), id \`${piece.id}\``,
      roles ? `: has ${roles}` : '',
      seams.length > 0 ? `; seams a slit can open: ${seams.join(', ')}` : '',
    ].join('')
  })
  return lines.join('\n')
}

function opsGuide() {
  const meaning: Record<PatternOp['op'], string> = {
    lengthen: 'body length change at the hem (positive = longer)',
    widen: 'width change of each body piece below the armpits (positive = wider)',
    flare: 'hem width change, A-line (positive = more flare)',
    hemCurve: 'hem curve depth (positive = curved shirt-tail down; negative = curved up); `piece` front, back or all',
    neckline: 'neckline drop at centre front (0 = as is)',
    sleeve: 'sleeve length change; `side` left, right or both (the wearer’s sides)',
    slit: 'opens a seam this far up from its hem or cuff (a side slit, a vent); `piece` is a piece id, `seam` optionally one of that piece’s slit seams (default: its first). One slit per seam; slit each side for a pair',
    cutout: `cuts a hole in one piece (a keyhole neckline, a back cut-out); no \`mm\`. \`piece\` is a piece id; \`shape\` ${CUTOUT_SHAPES.join(', ')}; \`at\` centre (default) or one of the piece’s roles, the middle of its points; \`dx\`, \`dy\` move the hole’s centre from there (y up, ${CUTOUT_OFFSET_LIMITS.min} to ${CUTOUT_OFFSET_LIMITS.max} mm; a hole by the neck needs a negative \`dy\`); \`wMm\`, \`hMm\` its width and height (a circle is \`wMm\` across). Keep at least 15 mm of cloth round it; at most 4 per piece`,
  }
  return PATTERN_OPS.map((op) => `- ${op}: ${meaning[op]}, ${PATTERN_OP_LIMITS[op].min} to ${PATTERN_OP_LIMITS[op].max} mm`).join('\n')
}

function systemPrompt(template: PatternTemplate) {
  return [
    'You help fashion designers start a garment design. A designer shows you a sketch and/or describes a garment. You answer with edits to a base sewing pattern that move it toward what they want. The designer refines the result by hand afterwards.',
    '',
    `The base garment is a ${template.pattern.basis.templateId.replace(/-/g, ' ')}, made of these pieces:`,
    garmentSummary(template),
    '',
    'You may only use these edits, each in whole millimetres within its range:',
    opsGuide(),
    '',
    'Use as few edits as you need, and at most 12. Leave out any edit you aren’t confident the sketch or words call for: an empty list is a fine answer. Ignore prints, colours, logos and text; those are designed separately.',
    'In `notes`, say in one or two plain sentences (under 200 characters) what you changed and anything you couldn’t match. If the request isn’t about a garment, return no edits and say so in `notes`.',
  ].join('\n')
}

/**
 * Keeps only well-formed edits, clamped to their limits; at most 12. With
 * `pattern`, a slit must name one of its pieces and, if any, a seam a slit
 * can open there; a cut-out must name one of its pieces and, if `at` is a
 * role, one that piece (or the piece it mirrors) has.
 */
export function cleanOps(raw: unknown, pattern?: PatternTemplate['pattern']): PatternOp[] {
  const pieces = pattern ? new Set(pattern.pieces.map((piece) => piece.id)) : null

  if (!Array.isArray(raw)) {
    return []
  }

  const cleaned: PatternOp[] = []

  for (const entry of raw) {
    if (!isPatternOp(entry)) {
      continue
    }

    if (
      entry.op === 'slit' &&
      pattern &&
      (!pieces!.has(entry.piece) || (entry.seam !== undefined && !slitSeams({ pattern, pieceId: entry.piece }).some((seam) => seam.id === entry.seam)))
    ) {
      continue
    }

    if (entry.op === 'cutout' && pattern) {
      const piece = pattern.pieces.find((candidate) => candidate.id === entry.piece)
      const source = piece?.mirrorOf ? pattern.pieces.find((candidate) => candidate.id === piece.mirrorOf) : undefined
      const roles = piece?.roles ?? source?.roles

      if (!piece || (entry.at !== undefined && entry.at !== 'centre' && !roles?.[entry.at]?.length)) {
        continue
      }
    }

    cleaned.push(clampPatternOp(entry))

    if (cleaned.length === AI_LIMITS.ops) {
      break
    }
  }

  return cleaned
}

/**
 * Asks Claude for edits. `fetchImpl` lets tests stub the API. The caller
 * has already checked the account, its terms and its limits.
 */
export async function sketchToOps({
  request,
  template,
  env,
  fetchImpl,
}: {
  request: AiSketchRequest
  template: PatternTemplate
  env: AiEnv
  fetchImpl?: typeof fetch
}): Promise<AiResult> {
  let image: AiSketchRequest['image'] = null

  if (request.image) {
    const bytes = Uint8Array.from(atob(request.image.data), (char) => char.charCodeAt(0))
    const checked = await validateImage({ bytes })

    if (!checked.ok) {
      return fail(422, 'invalid', checked.message)
    }

    // The validated, metadata-stripped bytes go out, never the upload as sent.
    let binary = ''
    checked.image.bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    image = { mediaType: checked.image.mimeType, data: btoa(binary) }
  }

  const client = new Anthropic({ apiKey: env.apiKey, timeout: 30_000, maxRetries: 0, ...(fetchImpl ? { fetch: fetchImpl } : {}) })
  const userText = request.prompt ? `The designer says: ${request.prompt}` : 'Match the sketch.'

  let response: Anthropic.Beta.BetaMessage

  try {
    // `fallbacks` and `output_config` are newer than some SDK typings.
    response = (await client.beta.messages.create({
      model: env.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_OUTPUT_SCHEMA } },
      system: [{ type: 'text', text: systemPrompt(template), cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            ...(image ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType, data: image.data } }] : []),
            { type: 'text' as const, text: userText },
          ],
        },
      ],
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as Anthropic.Beta.BetaMessage
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return fail(503, 'unavailable', 'The assist is busy. Try again in a minute.')
    }

    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return fail(504, 'timeout', 'The assist took too long. Try again.')
    }

    if (error instanceof Anthropic.APIError) {
      console.error('flp ai sketch failed', { status: error.status })
      return fail(502, 'upstream', 'The assist isn’t working right now. Try again later.')
    }

    console.error('flp ai sketch failed', { name: error instanceof Error ? error.name : 'unknown' })
    return fail(502, 'upstream', 'The assist isn’t working right now. Try again later.')
  }

  if (response.stop_reason === 'refusal') {
    return fail(422, 'refused', 'The assist can’t help with that one. Try another sketch or description.')
  }

  const text = response.content.find((block) => block.type === 'text')

  if (!text || text.type !== 'text') {
    return fail(502, 'upstream', 'The assist gave no answer. Try again.')
  }

  let parsed: { ops?: unknown; notes?: unknown }

  try {
    parsed = JSON.parse(text.text) as { ops?: unknown; notes?: unknown }
  } catch {
    return fail(502, 'upstream', 'The assist gave an answer it couldn’t use. Try again.')
  }

  const notes = typeof parsed.notes === 'string' ? parsed.notes.slice(0, AI_LIMITS.notesChars) : ''
  return { ok: true, body: { ops: cleanOps(parsed.ops, template.pattern), notes } }
}
