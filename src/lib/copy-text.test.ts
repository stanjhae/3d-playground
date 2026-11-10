import { describe, expect, test } from 'vitest'

import { copyText } from './copy-text'

describe('copyText', () => {
  test('reports success and writes the text', async () => {
    const written: string[] = []
    const clipboard = {
      writeText: async (text: string) => {
        written.push(text)
      },
    }

    await expect(copyText({ text: 'https://x.test/s/a', clipboard })).resolves.toBe(true)
    expect(written).toEqual(['https://x.test/s/a'])
  })

  test('reports a refusal instead of throwing', async () => {
    const clipboard = {
      writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    }

    await expect(copyText({ text: 'x', clipboard })).resolves.toBe(false)
  })

  test('reports a browser with no clipboard', async () => {
    await expect(copyText({ text: 'x', clipboard: undefined })).resolves.toBe(false)
  })
})
