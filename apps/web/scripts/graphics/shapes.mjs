import {
  BRASS,
  GOLD,
  INK,
  OX,
  P,
  PAPER,
  blob,
  circle,
  linear,
  outlined,
  path,
  place,
  poly,
  radial,
  ribbon,
  ringPath,
  rng,
  starPoints,
  sym,
} from './draw.mjs'

const BLUSH = '#e8c4b8'
const MEADOW = '#6b7c4a'

function regular(n, r, rotation = -90) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rotation + (i * 360) / n) * Math.PI) / 180
    return [r * Math.cos(a), r * Math.sin(a)]
  })
}

export const SHAPES = [
  {
    id: 'shape-ring',
    label: 'Double Ring',
    tags: ['ring', 'circle', 'halo', 'round', 'minimal'],
    width: 480,
    height: 480,
    draw() {
      let dots = ''
      for (let i = 0; i < 36; i += 1) {
        const [x, y] = place(240, 240, i * 10)(0, -150)
        dots += circle(x, y, 5)
      }
      return {
        body:
          P(ringPath(240, 240, 210) + ringPath(240, 240, 176, true), `fill="${INK}" fill-rule="evenodd"`) +
          `<g fill="${OX}">${dots}</g>` +
          P(ringPath(240, 240, 124) + ringPath(240, 240, 108, true), `fill="${BRASS}" fill-rule="evenodd" stroke="${INK}" stroke-width="3"`),
      }
    },
  },
  {
    id: 'shape-hexagon',
    label: 'Bevel Hexagon',
    tags: ['hexagon', 'geometric', 'bevel', 'honeycomb', 'badge'],
    width: 480,
    height: 480,
    draw() {
      const outer = regular(6, 220, -90)
      const inner = regular(6, 160, -90)
      const facets = outer.map((p, i) => {
        const q = outer[(i + 1) % 6]
        const shades = ['#f4d57e', '#efc560', '#b07c1c', '#8a5e12', '#b07c1c', '#f2d27a']
        return P(poly([p, q, inner[(i + 1) % 6], inner[i]], place(240, 240)), `fill="${shades[i]}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"`)
      })
      return {
        defs: linear('c', ['#4a4f59', INK], [0, 0, 1, 1]),
        body: facets.join('') + P(poly(inner, place(240, 240)), `fill="url(#c)" stroke="${INK}" stroke-width="4"`) + P(poly(outer, place(240, 240)), `fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`),
      }
    },
  },
  {
    id: 'shape-triangle',
    label: 'Nested Triangles',
    tags: ['triangle', 'geometric', 'pyramid', 'nested', 'modern'],
    width: 480,
    height: 440,
    draw() {
      const colors = [INK, PAPER, '#c3161c', PAPER, INK]
      return {
        body: colors.map((c, i) => P(poly(regular(3, 250 - i * 46, -90), place(240, 270)), `fill="${c}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`)).join(''),
      }
    },
  },
  {
    id: 'shape-diamond',
    label: 'Faceted Diamond',
    tags: ['diamond', 'rhombus', 'geometric', 'facet', 'lozenge'],
    width: 400,
    height: 520,
    draw() {
      const pts = [[200, 20], [370, 260], [200, 500], [30, 260]]
      const c = [200, 260]
      const shades = ['#d7263e', '#8e0f1e', '#5a0a14', '#b3123a']
      return {
        body:
          pts.map((p, i) => P(poly([c, p, pts[(i + 1) % 4]]), `fill="${shades[i]}"`)).join('') +
          P(poly([[200, 110], [306, 260], [200, 410], [94, 260]]), `fill="none" stroke="${BRASS}" stroke-width="4"`) +
          P(poly(pts), `fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`),
      }
    },
  },
  {
    id: 'shape-seal',
    label: 'Seal Badge',
    tags: ['seal', 'badge', 'stamp', 'rosette', 'award', 'scalloped'],
    width: 480,
    height: 480,
    draw() {
      const scallop = path()
      const n = 28
      for (let i = 0; i <= n; i += 1) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        const x = 240 + 200 * Math.cos(a)
        const y = 240 + 200 * Math.sin(a)
        if (i === 0) scallop.M(x, y)
        else scallop.A(24, 0, 1, x, y)
      }
      return {
        defs: radial('r', ['#e2444b', '#c3161c', '#7d0d14'], [0.4, 0.35, 0.7]) + linear('g', GOLD, [0, 0, 1, 1]),
        body:
          P(scallop.Z().d(), `fill="url(#r)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          circle(240, 240, 160, `fill="none" stroke="${PAPER}" stroke-width="4" stroke-dasharray="10 8"`) +
          circle(240, 240, 136, `fill="url(#g)" stroke="${INK}" stroke-width="5"`) +
          P(poly(starPoints(5, 70, 28), place(240, 246)), `fill="${OX}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`),
      }
    },
  },
  {
    id: 'shape-shield',
    label: 'Shield',
    tags: ['shield', 'crest', 'heraldry', 'badge', 'varsity', 'emblem'],
    width: 440,
    height: 520,
    draw() {
      const shield = (s) => sym([0, -230], [['L', 200, -230], ['C', 200, -40, 170, 120, 0, 240]], place(220, 260, 0, s))
      return {
        defs: `<clipPath id="in"><path d="${shield(0.86)}"/></clipPath>` + linear('g', GOLD, [0, 0, 1, 1]),
        body:
          outlined(P(shield(1)), 'url(#g)', { width: 7 }) +
          `<g clip-path="url(#in)">` +
          P(poly([[0, 0], [220, 0], [220, 520], [0, 520]]), `fill="${OX}"`) +
          P(poly([[220, 0], [440, 0], [440, 520], [220, 520]]), `fill="${INK}"`) +
          P(poly([[20, 330], [220, 170], [420, 330], [420, 400], [220, 240], [20, 400]]), `fill="url(#g)" stroke="${INK}" stroke-width="5"`) +
          `</g>` +
          P(shield(0.86), `fill="none" stroke="${INK}" stroke-width="5"`),
      }
    },
  },
  {
    id: 'shape-arch',
    label: 'Retro Arch',
    tags: ['arch', 'rainbow', 'retro', '70s', 'boho', 'stripes'],
    width: 560,
    height: 320,
    draw() {
      const colors = [OX, '#c96a2a', BRASS, BLUSH, MEADOW]
      const band = (r1, r2) => `M${280 - r1} 300A${r1} ${r1} 0 0 1 ${280 + r1} 300L${280 + r2} 300A${r2} ${r2} 0 0 0 ${280 - r2} 300Z`
      return {
        body: colors.map((c, i) => P(band(260 - i * 44, 216 - i * 44), `fill="${c}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`)).join(''),
      }
    },
  },
  {
    id: 'shape-blobs',
    label: 'Organic Blobs',
    tags: ['blob', 'organic', 'abstract', 'fluid', 'modern', 'shapes'],
    width: 520,
    height: 520,
    draw() {
      const random = rng(11)
      return {
        body:
          P(blob(200, 220, 160, random, { points: 9, jitter: 0.4 }), `fill="${BLUSH}" stroke="${INK}" stroke-width="6"`) +
          P(blob(350, 330, 120, random, { points: 8, jitter: 0.45 }), `fill="${MEADOW}" stroke="${INK}" stroke-width="6"`) +
          P(blob(330, 140, 70, random, { points: 7, jitter: 0.4 }), `fill="${OX}" stroke="${INK}" stroke-width="6"`) +
          P(blob(160, 400, 50, random, { points: 7, jitter: 0.4 }), `fill="${BRASS}" stroke="${INK}" stroke-width="6"`),
      }
    },
  },
  {
    id: 'shape-spiral',
    label: 'Spiral',
    tags: ['spiral', 'swirl', 'hypnotic', 'vortex', 'psychedelic'],
    width: 480,
    height: 480,
    draw() {
      const pts = []
      for (let i = 0; i <= 400; i += 1) {
        const t = i / 400
        const a = t * Math.PI * 2 * 4.5
        const r = 8 + 205 * t
        pts.push([240 + r * Math.cos(a), 240 + r * Math.sin(a)])
      }
      return { body: P(ribbon(pts, (t) => 4 + 22 * t), `fill="${INK}"`) }
    },
  },
  {
    id: 'shape-sunburst',
    label: 'Sunburst',
    tags: ['sunburst', 'rays', 'retro', 'pop art', 'radial', 'burst'],
    width: 520,
    height: 520,
    draw() {
      let rays = ''
      for (let i = 0; i < 36; i += 2) {
        const a = (i * 10 * Math.PI) / 180
        const b = ((i + 1) * 10 * Math.PI) / 180
        rays += P(poly([[260, 260], [260 + 400 * Math.cos(a), 260 + 400 * Math.sin(a)], [260 + 400 * Math.cos(b), 260 + 400 * Math.sin(b)]]))
      }
      return {
        defs: `<clipPath id="c">${circle(260, 260, 240)}</clipPath>`,
        body: circle(260, 260, 240, `fill="#ffd23f"`) + `<g clip-path="url(#c)" fill="#f5a312">${rays}</g>` + circle(260, 260, 240, `fill="none" stroke="${INK}" stroke-width="7"`) + circle(260, 260, 70, `fill="#d7262e" stroke="${INK}" stroke-width="6"`),
      }
    },
  },
  {
    id: 'shape-halftone',
    label: 'Halftone Circle',
    tags: ['halftone', 'dots', 'pop art', 'comic', 'gradient', 'circle'],
    width: 480,
    height: 480,
    draw() {
      let dots = ''
      const step = 22
      for (let y = step / 2; y < 480; y += step) {
        for (let x = step / 2; x < 480; x += step) {
          if (Math.hypot(x - 240, y - 240) > 220) continue
          const t = (x + y) / 960
          const r = 1 + 11 * t
          dots += circle(x, y, r)
        }
      }
      return { body: `<g fill="${INK}">${dots}</g>` }
    },
  },
  {
    id: 'shape-mandala',
    label: 'Mandala',
    tags: ['mandala', 'geometric', 'boho', 'radial', 'meditation', 'ornament'],
    width: 520,
    height: 520,
    draw() {
      const pointed = (T, w, L) => sym([0, -L], [['C', w * 0.3, -L * 0.75, w * 0.62, -L * 0.4, 0, 0]], T)
      const round = (T, w, L) => sym([0, -L], [['C', w * 0.6, -L, w * 0.65, -L * 0.3, 0, 0]], T)
      let out = ''
      for (let i = 0; i < 16; i += 1) out += P(pointed(place(260, 260, i * 22.5), 70, 245), `fill="${OX}" stroke="${INK}" stroke-width="3"`)
      for (let i = 0; i < 16; i += 1) out += P(round(place(260, 260, i * 22.5 + 11.25), 70, 190), `fill="${BLUSH}" stroke="${INK}" stroke-width="3"`)
      for (let i = 0; i < 12; i += 1) out += P(pointed(place(260, 260, i * 30), 60, 140), `fill="${BRASS}" stroke="${INK}" stroke-width="3"`)
      let dots = ''
      for (let i = 0; i < 32; i += 1) {
        const [x, y] = place(260, 260, i * 11.25)(0, -96)
        dots += circle(x, y, 5)
      }
      for (let i = 0; i < 8; i += 1) out += P(round(place(260, 260, i * 45), 40, 80), `fill="${MEADOW}" stroke="${INK}" stroke-width="3"`)
      return { body: out + `<g fill="${INK}">${dots}</g>` + circle(260, 260, 30, `fill="${PAPER}" stroke="${INK}" stroke-width="4"`) + circle(260, 260, 12, `fill="${OX}"`) }
    },
  },
  {
    id: 'shape-octagram',
    label: 'Eight-point Star',
    tags: ['octagram', 'star', 'geometric', 'islamic', 'tile', 'compass'],
    width: 480,
    height: 480,
    draw() {
      const square = (rot) => P(poly(regular(4, 210, rot), place(240, 240)))
      return {
        defs: linear('g', GOLD, [0, 0, 1, 1]),
        body:
          outlined(square(-90) + square(-45), 'url(#g)', { width: 6 }) +
          P(poly(regular(8, 150, -67.5), place(240, 240)), `fill="${INK}"`) +
          P(poly(starPoints(8, 130, 70, -90), place(240, 240)), `fill="${OX}" stroke="${BRASS}" stroke-width="3"`) +
          circle(240, 240, 34, `fill="url(#g)" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'shape-target',
    label: 'Roundel',
    tags: ['target', 'roundel', 'mod', 'bullseye', 'circle', 'retro'],
    width: 480,
    height: 480,
    draw() {
      return {
        body:
          circle(240, 240, 220, `fill="#1f3f7a" stroke="${INK}" stroke-width="6"`) +
          circle(240, 240, 150, `fill="${PAPER}" stroke="${INK}" stroke-width="5"`) +
          circle(240, 240, 80, `fill="#c3161c" stroke="${INK}" stroke-width="5"`),
      }
    },
  },
].map((g) => ({ ...g, category: 'shapes' }))
