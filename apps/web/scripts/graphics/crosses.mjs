import {
  GOLD,
  INK,
  P,
  SILVER,
  STEEL,
  circle,
  ellipse,
  linear,
  outlined,
  path,
  place,
  poly,
  radial,
  rect,
  ringPath,
  starPoints,
  sym,
} from './draw.mjs'

// Arm ends. Each draws one arm pointing up from the centre (0, 0), `L` long
// and `w` wide, in the local space of `T`.
const ENDS = {
  flat: (T, w, L) => P(sym([0, -L], [['L', w / 2, -L], ['L', w / 2, 0]], T)),
  gothic: (T, w, L) => {
    const tip = w * 1.15
    return P(
      sym(
        [0, -L],
        [
          ['C', w * 0.2, -L + tip * 0.3, w * 0.85, -L + tip * 0.38, w * 0.95, -L + tip * 0.78],
          ['C', w * 0.98, -L + tip * 0.98, w * 0.62, -L + tip * 0.98, w / 2, -L + tip * 1.15],
          ['L', w / 2, 0],
        ],
        T,
      ),
    )
  },
  patee: (T, w, L) => P(sym([0, -L], [['L', w * 1.2, -L], ['C', w * 0.9, -L * 0.62, w * 0.5, -L * 0.3, w * 0.3, 0]], T)),
  maltese: (T, w, L) => P(sym([0, -L + w * 0.6], [['L', w * 1.3, -L], ['L', 0, 0]], T)),
  fleury: (T, w, L) => {
    const tip = w * 1.5
    return P(
      sym(
        [0, -L],
        [
          ['C', w * 0.42, -L + tip * 0.22, w * 0.44, -L + tip * 0.55, w * 0.18, -L + tip * 0.76],
          ['C', w * 0.55, -L + tip * 0.42, w * 1.38, -L + tip * 0.38, w * 1.2, -L + tip * 0.9],
          ['C', w * 1.1, -L + tip * 1.12, w * 0.72, -L + tip * 1.0, w / 2, -L + tip * 1.12],
          ['L', w / 2, 0],
        ],
        T,
      ),
    )
  },
  budded: (T, w, L) => {
    const r = w * 0.56
    const dot = (x, y) => {
      const [cx, cy] = T(x, y)
      return circle(cx, cy, r)
    }
    return ENDS.flat(T, w, L - r) + dot(0, -L + r) + dot(-w * 0.74, -L + r * 2.05) + dot(w * 0.74, -L + r * 2.05)
  },
  potent: (T, w, L) => P(sym([0, -L], [['L', w * 1.05, -L], ['L', w * 1.05, -L + w * 0.62], ['L', w / 2, -L + w * 0.62], ['L', w / 2, 0]], T)),
}

/** Four arms, [up, right, down, left] long, around (cx, cy). */
function crossParts({ cx, cy, w, lengths, end, scale = 1 }) {
  return lengths.map((L, i) => ENDS[end](place(cx, cy, i * 90, scale), w, L)).join('') + rect(cx - (w * scale) / 2, cy - (w * scale) / 2, w * scale, w * scale)
}

const LATIN = [160, 140, 320, 140]
const OX_DARK = '#4a0f18'

function metal(id, colors, [x1, y1, x2, y2]) {
  return linear(id, colors, [x1, y1, x2, y2], true)
}

function gem(cx, cy, r, color) {
  const facets = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    const b = ((i + 1) * Math.PI) / 4
    const p1 = [cx + r * Math.cos(a), cy + r * Math.sin(a)]
    const p2 = [cx + r * Math.cos(b), cy + r * Math.sin(b)]
    const p3 = [cx + r * 0.55 * Math.cos((a + b) / 2), cy + r * 0.55 * Math.sin((a + b) / 2)]
    return P(poly([p1, p2, p3]), `fill="#fff" opacity="${(0.05 + (i % 4) * 0.08).toFixed(2)}"`)
  })
  return (
    circle(cx, cy, r, `fill="${color}" stroke="${INK}" stroke-width="5"`) +
    facets.join('') +
    P(poly(starPoints(8, r * 0.55, r * 0.5, -90 + 22.5), place(cx, cy)), `fill="#fff" opacity="0.18"`) +
    ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.28, r * 0.16, 'fill="#fff" opacity="0.7"')
  )
}

export const CROSSES = [
  {
    id: 'cross-simple',
    label: 'Simple Cross',
    tags: ['cross', 'latin', 'faith', 'christian', 'minimal', 'black'],
    width: 400,
    height: 560,
    draw() {
      const outer = crossParts({ cx: 200, cy: 200, w: 76, lengths: LATIN, end: 'flat' })
      const inner = crossParts({ cx: 200, cy: 200, w: 52, lengths: LATIN.map((l) => l - 12), end: 'flat' })
      return {
        defs: metal('m', ['#3a3f4a', INK, '#2a2e36'], [60, 40, 340, 520]),
        body: outlined(outer, 'url(#m)', { width: 5 }) + `<g fill="none" stroke="#c9ced6" stroke-width="2.5">${inner}</g>`,
      }
    },
  },
  {
    id: 'cross-gothic',
    label: 'Gothic Cross',
    tags: ['cross', 'gothic', 'goth', 'metal', 'dark', 'medieval'],
    width: 400,
    height: 560,
    draw() {
      const outer = crossParts({ cx: 200, cy: 200, w: 70, lengths: [170, 160, 330, 160], end: 'gothic' })
      const inner = crossParts({ cx: 200, cy: 200, w: 40, lengths: [150, 140, 305, 140], end: 'gothic' })
      const quatrefoil = [0, 90, 180, 270].map((a) => {
        const [x, y] = place(200, 200, a)(0, -34)
        return circle(x, y, 26)
      })
      return {
        defs: metal('m', STEEL, [40, 30, 360, 540]) + metal('s', SILVER, [150, 150, 250, 250]),
        body:
          outlined(outer, 'url(#m)', { width: 6 }) +
          `<g fill="none" stroke="url(#s)" stroke-width="3">${inner}</g>` +
          outlined(quatrefoil.join('') + rect(170, 170, 60, 60), 'url(#s)', { width: 5 }) +
          gem(200, 200, 26, '#a8101a'),
      }
    },
  },
  {
    id: 'cross-ornate',
    label: 'Ornate Cross',
    tags: ['cross', 'gold', 'fleury', 'baroque', 'jewel', 'luxury'],
    width: 440,
    height: 600,
    draw() {
      const outer = crossParts({ cx: 220, cy: 220, w: 64, lengths: [180, 170, 350, 170], end: 'fleury' })
      const inner = crossParts({ cx: 220, cy: 220, w: 30, lengths: [120, 110, 290, 110], end: 'flat' })
      const pearls = []
      for (const [i, L] of [110, 100, 280, 100].entries()) {
        for (let d = 60; d <= L; d += 26) {
          const [x, y] = place(220, 220, i * 90)(0, -d)
          pearls.push(circle(x, y, 6, `fill="#fffaf0" stroke="${INK}" stroke-width="2"`))
        }
      }
      return {
        defs: metal('g', GOLD, [40, 30, 400, 570]) + metal('d', ['#7a4c10', '#b07c1c', '#6a420c'], [190, 100, 250, 520]),
        body:
          outlined(outer, 'url(#g)', { width: 6 }) +
          `<g fill="url(#d)">${inner}</g>` +
          pearls.join('') +
          circle(220, 220, 50, `fill="url(#g)" stroke="${INK}" stroke-width="6"`) +
          gem(220, 220, 36, '#b3123a'),
      }
    },
  },
  {
    id: 'cross-flare',
    label: 'Flare Cross',
    tags: ['cross', 'pattee', 'templar', 'red', 'heraldry'],
    width: 400,
    height: 560,
    draw() {
      const outer = crossParts({ cx: 200, cy: 200, w: 62, lengths: [170, 160, 330, 160], end: 'patee' })
      const inner = crossParts({ cx: 200, cy: 200, w: 62, lengths: [170, 160, 330, 160], end: 'patee', scale: 0.84 })
      return {
        defs: metal('r', ['#e2444b', '#a8101a', OX_DARK], [40, 30, 360, 540]) + metal('g', GOLD, [40, 30, 360, 540]),
        body: outlined(outer, 'url(#g)', { width: 6 }) + `<g fill="url(#r)">${inner}</g>` + circle(200, 200, 16, `fill="url(#g)" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'cross-celtic',
    label: 'Celtic Cross',
    tags: ['cross', 'celtic', 'irish', 'ring', 'knot', 'stone'],
    width: 400,
    height: 580,
    draw() {
      const ring = P(ringPath(200, 200, 112) + ringPath(200, 200, 84, true), 'fill-rule="evenodd"')
      const arms = crossParts({ cx: 200, cy: 200, w: 64, lengths: [170, 165, 350, 165], end: 'flat' })
      const knots = []
      for (let i = 0; i < 4; i += 1) {
        const [x, y] = place(200, 200, 45 + i * 90)(0, -98)
        knots.push(circle(x, y, 7))
      }
      const lines = crossParts({ cx: 200, cy: 200, w: 36, lengths: [150, 145, 330, 145], end: 'flat' })
      return {
        defs: metal('s', ['#eceae3', '#b9b6ab', '#7f7c72', '#d8d5cb', '#8e8b80'], [40, 30, 360, 550]),
        body:
          outlined(ring + arms, 'url(#s)', { width: 6 }) +
          `<g fill="none" stroke="#5c5a52" stroke-width="3">${lines}${P(ringPath(200, 200, 98))}</g>` +
          `<g fill="#5c5a52">${knots.join('')}</g>` +
          circle(200, 200, 24, `fill="url(#s)" stroke="${INK}" stroke-width="5"`) +
          circle(200, 200, 10, `fill="none" stroke="#5c5a52" stroke-width="3"`),
      }
    },
  },
  {
    id: 'cross-maltese',
    label: 'Maltese Cross',
    tags: ['cross', 'maltese', 'firefighter', 'knight', 'badge', 'red'],
    width: 480,
    height: 480,
    draw() {
      const parts = crossParts({ cx: 240, cy: 240, w: 84, lengths: [210, 210, 210, 210], end: 'maltese' })
      const inner = crossParts({ cx: 240, cy: 240, w: 84, lengths: [210, 210, 210, 210], end: 'maltese', scale: 0.8 })
      return {
        defs: metal('r', ['#e2444b', '#c3161c', '#7d0d14'], [30, 30, 450, 450]) + metal('g', GOLD, [30, 30, 450, 450]),
        body: outlined(parts, 'url(#g)', { width: 6 }) + `<g fill="url(#r)">${inner}</g>` + circle(240, 240, 30, `fill="url(#g)" stroke="${INK}" stroke-width="5"`),
      }
    },
  },
  {
    id: 'cross-budded',
    label: 'Budded Cross',
    tags: ['cross', 'trefoil', 'budded', 'gold', 'church'],
    width: 400,
    height: 580,
    draw() {
      const outer = crossParts({ cx: 200, cy: 210, w: 56, lengths: [180, 160, 340, 160], end: 'budded' })
      const inner = crossParts({ cx: 200, cy: 210, w: 20, lengths: [130, 110, 290, 110], end: 'flat' })
      return {
        defs: metal('g', GOLD, [40, 30, 360, 560]) + metal('d', ['#7a4c10', '#b07c1c', '#6a420c'], [190, 100, 250, 520]),
        body: outlined(outer, 'url(#g)', { width: 6 }) + `<g fill="url(#d)">${inner}</g>` + circle(200, 210, 20, `fill="#fffaf0" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'cross-orthodox',
    label: 'Orthodox Cross',
    tags: ['cross', 'orthodox', 'byzantine', 'three bar', 'silver'],
    width: 400,
    height: 600,
    draw() {
      const parts =
        rect(176, 30, 48, 540) +
        rect(130, 92, 140, 40) +
        rect(60, 190, 280, 48) +
        P(poly([[-90, -20], [90, -20], [90, 20], [-90, 20]], place(200, 440, -22)))
      const lines = rect(196, 50, 8, 500) + rect(150, 108, 100, 8) + rect(80, 210, 240, 8) + P(poly([[-70, -4], [70, -4], [70, 4], [-70, 4]], place(200, 440, -22)))
      return {
        defs: metal('s', SILVER, [40, 30, 360, 570]),
        body: outlined(parts, 'url(#s)', { width: 6 }) + `<g fill="#7d8590">${lines}</g>`,
      }
    },
  },
  {
    id: 'cross-jerusalem',
    label: 'Jerusalem Cross',
    tags: ['cross', 'jerusalem', 'crusader', 'five', 'gold', 'heraldry'],
    width: 480,
    height: 480,
    draw() {
      const big = crossParts({ cx: 240, cy: 240, w: 52, lengths: [200, 200, 200, 200], end: 'potent' })
      const small = [
        [130, 130],
        [350, 130],
        [130, 350],
        [350, 350],
      ]
        .map(([x, y]) => crossParts({ cx: x, cy: y, w: 22, lengths: [52, 52, 52, 52], end: 'flat' }))
        .join('')
      return {
        defs: metal('g', GOLD, [30, 30, 450, 450]),
        body: outlined(big + small, 'url(#g)', { width: 6 }) + `<g fill="none" stroke="#9a6a14" stroke-width="3">${crossParts({ cx: 240, cy: 240, w: 26, lengths: [180, 180, 180, 180], end: 'flat' })}</g>`,
      }
    },
  },
  {
    id: 'cross-thorns',
    label: 'Cross with Thorns',
    tags: ['cross', 'thorns', 'crown', 'wood', 'easter', 'faith'],
    width: 440,
    height: 600,
    draw() {
      const wood = crossParts({ cx: 220, cy: 210, w: 70, lengths: [180, 170, 360, 170], end: 'flat' })
      const grain = []
      for (let i = 0; i < 5; i += 1) {
        const x = 196 + i * 12
        grain.push(P(path().M(x, 40).C(x + 6, 200, x - 6, 360, x + 3, 560).d()))
        const y = 186 + i * 12
        grain.push(P(path().M(56, y).C(160, y + 5, 280, y - 5, 384, y + 2).d()))
      }
      const strand = (phase) => {
        const pts = []
        for (let i = 0; i <= 160; i += 1) {
          const t = (i / 160) * Math.PI * 2
          const r = 9 * Math.sin(t * 9 + phase)
          pts.push([220 + (118 + r) * Math.cos(t), 210 + (44 + r) * Math.sin(t)])
        }
        return P(poly(pts, undefined, false))
      }
      const thorns = []
      for (let i = 0; i < 18; i += 1) {
        const t = (i / 18) * Math.PI * 2 + 0.1
        const x = 220 + 124 * Math.cos(t)
        const y = 210 + 50 * Math.sin(t)
        const out = Math.atan2(Math.sin(t) / 50, Math.cos(t) / 118) * (180 / Math.PI) + 90 + (i % 2 ? 25 : -25)
        thorns.push(P(poly([[-5, 0], [0, -22], [5, 0]], place(x, y, out))))
      }
      return {
        defs: metal('w', ['#a8743f', '#6e4521', '#8d5a2b', '#5a3618'], [40, 30, 400, 570]),
        body:
          outlined(wood, 'url(#w)', { width: 6 }) +
          `<g fill="none" stroke="#4a2c12" stroke-width="2" opacity="0.6">${grain.join('')}</g>` +
          `<g fill="#3b4a1f" stroke="${INK}" stroke-width="2">${thorns.join('')}</g>` +
          `<g fill="none" stroke-linecap="round"><g stroke="${INK}" stroke-width="13">${strand(0)}${strand(Math.PI)}</g><g stroke="#6b7c4a" stroke-width="7">${strand(0)}</g><g stroke="#55663a" stroke-width="7">${strand(Math.PI)}</g></g>`,
      }
    },
  },
  {
    id: 'cross-rays',
    label: 'Radiant Cross',
    tags: ['cross', 'rays', 'glory', 'light', 'sunburst', 'faith'],
    width: 480,
    height: 600,
    draw() {
      const rays = []
      for (let i = 0; i < 24; i += 1) {
        const long = i % 2 === 0
        rays.push(P(poly([[-12, 0], [0, long ? -230 : -170], [12, 0]], place(240, 220, i * 15))))
      }
      const cross = crossParts({ cx: 240, cy: 220, w: 64, lengths: [180, 150, 350, 150], end: 'flat' })
      return {
        defs: radial('ray', [['#fff6cc', 0], ['#f4d57e', 0.5], ['#efc56000', 1]], [240, 220, 240], true) + metal('s', ['#ffffff', '#f2efe6', '#cfc8b6'], [60, 40, 420, 580]),
        body: `<g fill="url(#ray)">${rays.join('')}</g>` + outlined(cross, 'url(#s)', { width: 6 }) + circle(240, 220, 14, `fill="#efc560" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'cross-rosary',
    label: 'Rosary',
    tags: ['cross', 'rosary', 'beads', 'prayer', 'necklace', 'chain'],
    width: 400,
    height: 600,
    draw() {
      const beads = []
      const n = 44
      for (let i = 0; i < n; i += 1) {
        const t = (i / n) * Math.PI * 2
        const x = 200 + 130 * Math.sin(t) * (0.75 + 0.25 * Math.cos(t))
        const y = 210 - 170 * Math.cos(t) * 0.9 + 20
        const big = i % 11 === 0
        beads.push(circle(x, y, big ? 13 : 9, `fill="${big ? 'url(#pb)' : 'url(#bd)'}" stroke="${INK}" stroke-width="3"`))
      }
      const chain = [0, 1, 2, 3].map((i) => circle(200, 420 + i * 18, 6, `fill="url(#bd)" stroke="${INK}" stroke-width="3"`))
      const small = crossParts({ cx: 200, cy: 512, w: 26, lengths: [42, 38, 76, 38], end: 'flat' })
      return {
        defs: radial('bd', ['#c7708a', '#8a1c3d', '#4d0b1f'], [0.35, 0.3, 0.7]) + radial('pb', ['#fff', '#f2d27a', '#9a6a14'], [0.35, 0.3, 0.7]) + metal('s', SILVER, [150, 450, 250, 600]),
        body:
          beads.join('') +
          ellipse(200, 398, 24, 30, `fill="url(#s)" stroke="${INK}" stroke-width="4"`) +
          ellipse(200, 398, 12, 17, `fill="none" stroke="#7d8590" stroke-width="3"`) +
          chain.join('') +
          outlined(small, 'url(#s)', { width: 4 }),
      }
    },
  },
].map((g) => ({ ...g, category: 'crosses' }))

