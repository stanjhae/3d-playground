import { readFileSync, writeFileSync } from 'node:fs'

import { vercelHeaders } from '../src/lib/security-headers.ts'

// Writes the security headers (Q02 #187) from src/lib/security-headers.ts
// into vercel.json, which can't import code. The unit test fails until
// this has been run after a policy change.
const path = new URL('../vercel.json', import.meta.url)
const config = JSON.parse(readFileSync(path, 'utf8'))
const { $schema, headers: _previous, ...rest } = config
writeFileSync(path, `${JSON.stringify({ $schema, headers: vercelHeaders(), ...rest }, null, 2)}\n`)
