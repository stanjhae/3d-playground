import { describe, expect, test } from 'vitest'

import { TINY_JPEG } from '../image-fixtures'
import { patternTemplateFor } from '../pattern/templates'
import { AI_LIMITS, AI_OUTPUT_SCHEMA, aiEnv, cleanOps, parseAiRequest, sketchToOps } from './ai-sketch'

/** The AI assist with the Anthropic API stubbed: nothing leaves the test. */

const template = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!
const env = { apiKey: 'test-key', model: 'claude-opus-5-5', dailyLimit: 30 }

function base64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function message({ text, stop = 'end_turn' }: { text?: string; stop?: string }) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: text === undefined ? [] : [{ type: 'text', text }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}

/** A fetch that records the request and answers with `status` and `body`. */
function stub({ status = 200, body }: { status?: number; body: unknown }) {
  const seen: { url: string; headers: Headers; body: Record<string, unknown> }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })
  }) as typeof fetch
  return { fetchImpl, seen }
}

const describeTee = { template: { id: 'tee-crew-short', version: 4 }, prompt: 'a cropped tee with a deep scoop neck', image: null }

describe('the AI assist', () => {
  test('is off unless the server turns it on with a key', () => {
    expect(aiEnv({})).toBeNull()
    expect(aiEnv({ FLP_AI_ASSIST: 'true' })).toBeNull()
    expect(aiEnv({ ANTHROPIC_API_KEY: 'k' })).toBeNull()
    expect(aiEnv({ FLP_AI_ASSIST: 'true', ANTHROPIC_API_KEY: 'k' })).toEqual({ apiKey: 'k', model: 'claude-opus-5-5', dailyLimit: 30 })
    expect(aiEnv({ FLP_AI_ASSIST: 'true', ANTHROPIC_API_KEY: 'k', FLP_AI_MODEL: 'claude-sonnet-5-5', FLP_AI_DAILY_LIMIT: '5' })).toMatchObject({
      model: 'claude-sonnet-5-5',
      dailyLimit: 5,
    })
  })

  test('asks Claude for bounded edits as structured output, with refusal fallbacks', async () => {
    const { fetchImpl, seen } = stub({ body: message({ text: JSON.stringify({ ops: [{ op: 'lengthen', mm: -120 }, { op: 'neckline', mm: 90 }], notes: 'Cropped it and dropped the neck.' }) }) })
    const result = await sketchToOps({ request: { ...describeTee, image: { mediaType: 'image/jpeg', data: base64(TINY_JPEG) } }, template, env, fetchImpl })

    expect(result).toEqual({ ok: true, body: { ops: [{ op: 'lengthen', mm: -120 }, { op: 'neckline', mm: 90 }], notes: 'Cropped it and dropped the neck.' } })
    const sent = seen[0]!
    expect(sent.url).toContain('/v1/messages')
    expect(sent.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(sent.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_OUTPUT_SCHEMA } },
    })
    // Thinking can't be turned off on Opus 5.5, so it isn't sent at all.
    expect(sent.body.thinking).toBeUndefined()
    const system = sent.body.system as Array<{ text: string; cache_control?: unknown }>
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' })
    expect(system[0]!.text).toContain('Front (front)')
    const content = (sent.body.messages as Array<{ content: Array<{ type: string }> }>)[0]!.content
    // The image comes first, then the words.
    expect(content.map((block) => block.type)).toEqual(['image', 'text'])
  })

  test("Claude's edits are cleaned: unknown ones dropped, sizes clamped, at most twelve, notes cut short", () => {
    const raw = [
      { op: 'lengthen', mm: 9999 },
      { op: 'explode', mm: 1 },
      { op: 'sleeve', side: 'left', mm: -9999 },
      { op: 'neckline', mm: 10, outline: [] },
      ...Array.from({ length: 20 }, () => ({ op: 'flare', mm: 10 })),
    ]
    const ops = cleanOps(raw)
    expect(ops[0]).toEqual({ op: 'lengthen', mm: 400 })
    expect(ops[1]).toEqual({ op: 'sleeve', side: 'left', mm: -250 })
    expect(ops).toHaveLength(AI_LIMITS.ops)
    expect(cleanOps('nope')).toEqual([])
  })

  test('a slit comes back as an edit on a named piece and seam, and Claude is told which seams a slit can open', async () => {
    const answer = {
      ops: [
        { op: 'slit', piece: 'front', seam: 'sideL', mm: 150 },
        { op: 'slit', piece: 'front', seam: 'sideR', mm: 9999 },
        { op: 'slit', piece: 'sleeveL', mm: 40 },
      ],
      notes: 'Side slits and a vented left cuff.',
    }
    const { fetchImpl, seen } = stub({ body: message({ text: JSON.stringify(answer) }) })
    const result = await sketchToOps({ request: describeTee, template, env, fetchImpl })

    expect(result).toEqual({
      ok: true,
      body: {
        ops: [
          { op: 'slit', piece: 'front', seam: 'sideL', mm: 150 },
          { op: 'slit', piece: 'front', seam: 'sideR', mm: 400 },
          { op: 'slit', piece: 'sleeveL', mm: 40 },
        ],
        notes: 'Side slits and a vented left cuff.',
      },
    })
    const system = (seen[0]!.body.system as Array<{ text: string }>)[0]!.text
    expect(system).toContain('id `front`')
    expect(system).toContain('seams a slit can open: sideL, sideR')
    expect(system).toMatch(/- slit: opens a seam .*, 30 to 400 mm/)
    const schema = AI_OUTPUT_SCHEMA.properties.ops.items
    expect(schema.properties.op.enum).toContain('slit')
    expect(schema.properties.seam).toEqual({ type: 'string' })
  })

  test('a slit on a piece or seam the garment lacks is dropped', () => {
    const raw = [
      { op: 'slit', piece: 'pocket', mm: 100 },
      { op: 'slit', piece: 'front', seam: 'shoulderL', mm: 100 },
      { op: 'slit', piece: 'front', seam: 'side L', mm: 100 },
      { op: 'slit', piece: 'back', mm: 10 },
      { op: 'hemCurve', piece: 'sideways', mm: 10 },
    ]
    expect(cleanOps(raw, template.pattern)).toEqual([{ op: 'slit', piece: 'back', mm: 30 }])
    // Without the garment, only the shape is checked.
    expect(cleanOps(raw)).toHaveLength(3)
  })

  test('a refusal, a garbled answer and an outage each get a plain message', async () => {
    const refused = await sketchToOps({ request: describeTee, template, env, fetchImpl: stub({ body: message({ stop: 'refusal' }) }).fetchImpl })
    expect(refused).toMatchObject({ ok: false, status: 422, code: 'refused' })

    const garbled = await sketchToOps({ request: describeTee, template, env, fetchImpl: stub({ body: message({ text: 'not json' }) }).fetchImpl })
    expect(garbled).toMatchObject({ ok: false, status: 502 })

    const busy = await sketchToOps({
      request: describeTee,
      template,
      env,
      fetchImpl: stub({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } }).fetchImpl,
    })
    expect(busy).toMatchObject({ ok: false, status: 503 })

    const down = await sketchToOps({
      request: describeTee,
      template,
      env,
      fetchImpl: stub({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'oops' } } }).fetchImpl,
    })
    expect(down).toMatchObject({ ok: false, status: 502 })

    const long = await sketchToOps({ request: describeTee, template, env, fetchImpl: stub({ body: message({ text: JSON.stringify({ ops: [], notes: 'x'.repeat(500) }) }) }).fetchImpl })
    expect(long.ok && long.body.notes).toHaveLength(AI_LIMITS.notesChars)
  })

  test('a sketch that is not a real image never reaches Claude', async () => {
    const { fetchImpl, seen } = stub({ body: message({ text: '{}' }) })
    const result = await sketchToOps({ request: { ...describeTee, image: { mediaType: 'image/png', data: btoa('<svg/>') } }, template, env, fetchImpl })
    expect(result).toMatchObject({ ok: false, status: 422 })
    expect(seen).toHaveLength(0)
  })

  test('requests are checked before anything is sent', () => {
    expect(parseAiRequest(null)).toEqual({ ok: false, message: 'Expected a JSON object' })
    expect(parseAiRequest({ template: { id: 'tee-crew-short', version: 4 } })).toEqual({ ok: false, message: 'Add a sketch or a description' })
    expect(parseAiRequest({ template: { id: 'tee-crew-short', version: 4 }, prompt: 'x'.repeat(501) }).ok).toBe(false)
    expect(parseAiRequest({ template: { id: 'tee-crew-short', version: 4 }, image: { mediaType: 'image/gif', data: 'x' } }).ok).toBe(false)
    expect(parseAiRequest({ template: { id: 'tee-crew-short', version: 4 }, image: { mediaType: 'image/png', data: 'x'.repeat(3_000_000) } }).ok).toBe(false)
    expect(parseAiRequest({ template: { id: 'tee-crew-short', version: 4 }, prompt: '  wide flared tee  ' })).toEqual({
      ok: true,
      request: { template: { id: 'tee-crew-short', version: 4 }, prompt: 'wide flared tee', image: null },
    })
  })
})
