import { BRASS, INK, OX, P, PAPER, blob, circle, linear, path, poly, rect, rng } from './draw.mjs'

const SIZE = 512

/** A square swatch filled with a repeating tile. */
function swatch(tile, w, h, content, extraDefs = '') {
  return {
    defs: `${extraDefs}<pattern id="${tile}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${content}</pattern>`,
    body: rect(0, 0, SIZE, SIZE, `fill="url(#${tile})"`),
  }
}

const base = (fill, w = SIZE, h = SIZE) => rect(0, 0, w, h, `fill="${fill}"`)

export const PATTERNS = [
  {
    id: 'shape-stripe',
    label: 'Stripe Block',
    tags: ['stripes', 'stripe', 'breton', 'nautical', 'lines', 'pattern'],
    draw: () => swatch('t', 64, 64, base(PAPER, 64, 64) + rect(0, 8, 64, 26, `fill="${INK}"`) + rect(0, 46, 64, 4, `fill="${BRASS}"`)),
  },
  {
    id: 'pat-checker',
    label: 'Checkerboard',
    tags: ['checker', 'checkerboard', 'ska', 'racing', 'grid', 'pattern'],
    draw: () => swatch('t', 128, 128, base(PAPER, 128, 128) + rect(0, 0, 64, 64, `fill="${INK}"`) + rect(64, 64, 64, 64, `fill="${INK}"`)),
  },
  {
    id: 'pat-polka',
    label: 'Polka Dots',
    tags: ['polka', 'dots', 'spots', 'retro', 'pin-up', 'pattern'],
    draw: () => swatch('t', 96, 96, base('#c3161c', 96, 96) + circle(24, 24, 15, `fill="${PAPER}"`) + circle(72, 72, 15, `fill="${PAPER}"`)),
  },
  {
    id: 'pat-halftone',
    label: 'Halftone Fade',
    tags: ['halftone', 'dots', 'gradient', 'fade', 'comic', 'pattern'],
    draw() {
      let dots = ''
      for (let y = 8; y < SIZE; y += 16) {
        const shift = (y / 16) % 2 ? 8 : 0
        for (let x = 8 + shift; x < SIZE + 8; x += 16) dots += circle(x, y, 0.6 + 8.4 * (y / SIZE))
      }
      return { body: base(PAPER) + `<g fill="${INK}">${dots}</g>` }
    },
  },
  {
    id: 'pat-chevron',
    label: 'Chevron',
    tags: ['chevron', 'zigzag', 'stripes', 'geometric', 'pattern'],
    draw: () =>
      swatch(
        't',
        128,
        64,
        base(PAPER, 128, 64) +
          P(path().M(-32, 48).L(32, -16).L(96, 48).L(160, -16).d(), `fill="none" stroke="${INK}" stroke-width="20"`) +
          P(path().M(-32, 112).L(32, 48).L(96, 112).L(160, 48).d(), `fill="none" stroke="${INK}" stroke-width="20"`) +
          P(path().M(-32, 80).L(32, 16).L(96, 80).L(160, 16).d(), `fill="none" stroke="${OX}" stroke-width="6"`),
      ),
  },
  {
    id: 'pat-houndstooth',
    label: 'Houndstooth',
    tags: ['houndstooth', 'check', 'tweed', 'tailoring', 'classic', 'pattern'],
    draw: () =>
      swatch(
        't',
        64,
        64,
        base(PAPER, 64, 64) +
          `<g fill="${INK}">` +
          rect(0, 32, 32, 32) +
          P(poly([[0, 16], [16, 0], [32, 0], [0, 32]])) +
          P(poly([[48, 32], [64, 32], [32, 64], [32, 48]])) +
          P(poly([[32, 32], [48, 16], [48, 32]])) +
          P(poly([[0, 64], [16, 48], [16, 64]])) +
          `</g>`,
      ),
  },
  {
    id: 'pat-tartan',
    label: 'Tartan',
    tags: ['tartan', 'plaid', 'check', 'punk', 'scottish', 'grunge', 'pattern'],
    draw() {
      const bands = [
        [0, 40, '#1f3f7a', 0.55],
        [52, 8, '#ffd23f', 0.7],
        [72, 36, '#1f4a2a', 0.55],
        [118, 6, PAPER, 0.6],
      ]
      let tile = base('#a8101a', 128, 128)
      for (const [o, w, c, a] of bands) tile += rect(0, o, 128, w, `fill="${c}" opacity="${a}"`)
      for (const [o, w, c, a] of bands) tile += rect(o, 0, w, 128, `fill="${c}" opacity="${a}"`)
      tile += P(path().M(0, 100).L(128, 100).M(100, 0).L(100, 128).d(), `stroke="${INK}" stroke-width="2" opacity="0.6"`)
      return swatch('t', 128, 128, tile)
    },
  },
  {
    id: 'pat-argyle',
    label: 'Argyle',
    tags: ['argyle', 'diamond', 'preppy', 'knit', 'golf', 'pattern'],
    draw: () =>
      swatch(
        't',
        128,
        160,
        base(OX, 128, 160) +
          P(poly([[64, 0], [128, 80], [64, 160], [0, 80]]), `fill="${BRASS}"`) +
          P(path().M(0, 0).L(128, 160).M(128, 0).L(0, 160).d(), `stroke="${PAPER}" stroke-width="3" stroke-dasharray="8 6"`),
      ),
  },
  {
    id: 'pat-waves',
    label: 'Wave Pattern',
    tags: ['waves', 'seigaiha', 'japanese', 'ocean', 'scallop', 'pattern'],
    draw() {
      const wave = (cx, cy) =>
        [56, 44, 32, 20, 8].map((r, i) => circle(cx, cy, r, `fill="${i % 2 ? PAPER : '#1f3f7a'}" stroke="${PAPER}" stroke-width="3"`)).join('')
      return swatch('t', 112, 56, base('#1f3f7a', 112, 56) + wave(0, 0) + wave(112, 0) + wave(56, 28) + wave(0, 56) + wave(112, 56))
    },
  },
  {
    id: 'pat-scales',
    label: 'Dragon Scales',
    tags: ['scales', 'dragon', 'mermaid', 'fish', 'snake', 'pattern'],
    draw() {
      const scale = (cx, cy) => P(path().M(cx - 32, cy).A(32, 0, 0, cx + 32, cy).L(cx + 32, cy - 36).L(cx - 32, cy - 36).Z().d(), `fill="url(#g)" stroke="${INK}" stroke-width="3"`)
      return swatch('t', 64, 64, base('#1f4a2a', 64, 64) + scale(32, 68) + scale(0, 36) + scale(64, 36) + scale(32, 4), linear('g', ['#1f4a2a', '#3f8a5a', '#9fdcb0']))
    },
  },
  {
    id: 'pat-honeycomb',
    label: 'Honeycomb',
    tags: ['honeycomb', 'hexagon', 'bee', 'geometric', 'grid', 'pattern'],
    draw() {
      const r = 32
      const h = Math.sqrt(3) * r
      const hex = (cx, cy) => P(poly(Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3)])), `fill="none" stroke="${BRASS}" stroke-width="6"`)
      return swatch('t', 3 * r, h, base(INK, 3 * r, h) + hex(0, 0) + hex(0, h) + hex(1.5 * r, h / 2) + hex(3 * r, 0) + hex(3 * r, h))
    },
  },
  {
    id: 'pat-leopard',
    label: 'Leopard Print',
    tags: ['leopard', 'animal print', 'cheetah', 'wild', 'rock', 'pattern'],
    draw() {
      const random = rng(3)
      let spots = ''
      for (let i = 0; i < 50; i += 1) {
        const cx = random() * SIZE
        const cy = random() * SIZE
        const r = 22 + random() * 16
        spots += P(blob(cx, cy, r * 0.75, random, { points: 7, jitter: 0.45 }), 'fill="#b0601c"')
        const arcs = 3 + Math.floor(random() * 2)
        const start = random() * Math.PI * 2
        for (let k = 0; k < arcs; k += 1) {
          const a = start + (k * Math.PI * 2) / arcs
          const b = a + ((Math.PI * 2) / arcs) * (0.45 + random() * 0.3)
          const rr = r * (0.95 + random() * 0.2)
          spots += P(
            `M${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(cx + rr * Math.cos(b)).toFixed(1)} ${(cy + rr * Math.sin(b)).toFixed(1)}`,
            `fill="none" stroke="${INK}" stroke-width="${(r * 0.32).toFixed(1)}" stroke-linecap="round"`,
          )
        }
      }
      for (let i = 0; i < 40; i += 1) spots += circle(random() * SIZE, random() * SIZE, 4 + random() * 5, `fill="${INK}"`)
      return { body: base('#e3a54a') + spots }
    },
  },
  {
    id: 'pat-camo',
    label: 'Camouflage',
    tags: ['camo', 'camouflage', 'military', 'army', 'street', 'pattern'],
    draw() {
      const random = rng(19)
      const layer = (fill, count, r) => {
        let out = ''
        for (let i = 0; i < count; i += 1) out += P(blob(random() * SIZE, random() * SIZE, r * (0.6 + random() * 0.8), random, { points: 9, jitter: 0.7, stretch: 1.4 }), `fill="${fill}"`)
        return out
      }
      return { body: base('#7a7f4f') + layer('#4f5a32', 22, 70) + layer('#8a6a3f', 18, 52) + layer('#23281a', 20, 34) }
    },
  },
  {
    id: 'pat-greek-key',
    label: 'Greek Key',
    tags: ['greek key', 'meander', 'border', 'classical', 'geometric', 'pattern'],
    draw() {
      const key = path().M(0, 56).L(0, 8).L(48, 8).L(48, 44).L(20, 44).L(20, 28).L(32, 28).M(64, 56).L(64, 56).d()
      return swatch('t', 64, 64, base(INK, 64, 64) + P(key, `fill="none" stroke="${BRASS}" stroke-width="7" stroke-linecap="square"`) + P(path().M(0, 60).L(64, 60).d(), `stroke="${BRASS}" stroke-width="7"`))
    },
  },
  {
    id: 'pat-pinstripe',
    label: 'Pinstripe',
    tags: ['pinstripe', 'stripes', 'suit', 'tailoring', 'baseball', 'pattern'],
    draw: () => swatch('t', 32, 32, base('#1c2433', 32, 32) + rect(15, 0, 2, 32, `fill="${PAPER}" opacity="0.85"`)),
  },
].map((g) => ({ ...g, category: 'patterns', width: SIZE, height: SIZE }))
