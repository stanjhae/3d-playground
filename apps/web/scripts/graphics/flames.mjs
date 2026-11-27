import {
  FIRE_CORE,
  FIRE_MID,
  FIRE_OUTER,
  INK,
  P,
  circle,
  ellipse,
  linear,
  outlined,
  path,
  place,
  radial,
  rect,
  ringPath,
  ribbon,
  sym,
  swell,
  turtle,
} from './draw.mjs'

/** One tongue of flame standing on (0, 0), `h` tall, its tip `lean` aside. */
export function tongue(T, w, h, lean) {
  return path(T)
    .M(-w / 2, 0)
    .C(-w * 0.62, -h * 0.42, -w * 0.12 + lean * 0.35, -h * 0.66, lean, -h)
    .C(lean * 0.45 + w * 0.14, -h * 0.7, w * 0.62, -h * 0.42, w / 2, 0)
    .C(w * 0.5, w * 0.36, -w * 0.5, w * 0.36, -w / 2, 0)
    .Z()
    .d()
}

/**
 * Three nested layers of tongues: an outlined outer flame, a mid flame and
 * a pale core, each shorter and narrower than the last.
 */
export function flameStack({ T, tongues, fills, outline = 7 }) {
  const layer = (hs, ws, lift) =>
    tongues
      .map(([dx, w, h, lean]) => P(tongue(then2(T, dx, -h * lift), w * ws, h * hs, lean * hs)))
      .join('')
  return [
    outlined(layer(1, 1, 0), fills[0], { width: outline }),
    `<g fill="${fills[1]}">${layer(0.72, 0.66, 0.02)}</g>`,
    `<g fill="${fills[2]}">${layer(0.44, 0.36, 0.04)}</g>`,
  ].join('')
}

function then2(T, dx, dy) {
  return (x, y) => T(x + dx, y + dy)
}

function fireDefs(top, bottom) {
  return [
    linear('fo', FIRE_OUTER, [0, top, 0, bottom], true),
    linear('fm', FIRE_MID, [0, top, 0, bottom], true),
    linear('fc', FIRE_CORE, [0, top, 0, bottom], true),
  ].join('')
}

const FILLS = ['url(#fo)', 'url(#fm)', 'url(#fc)']

function spark(T, s) {
  return P(tongue(T, 18 * s, 42 * s, 4 * s))
}

/** A hot-rod lick: rooted at x = 0, flowing right, its tip curling up. */
function lick(T, t, L, curl) {
  return path(T)
    .M(0, -t / 2)
    .C(L * 0.32, -t * 0.62, L * 0.6, -t * 0.25, L * 0.78, -t * 0.5 - curl * 0.35)
    .C(L * 0.88, -t * 0.66 - curl * 0.6, L * 0.95, -t * 0.62 - curl, L, -t * 0.56 - curl)
    .C(L * 0.93, -t * 0.12 - curl * 0.55, L * 0.82, t * 0.16, L * 0.64, t * 0.3)
    .C(L * 0.42, t * 0.52, L * 0.2, t * 0.5, 0, t / 2)
    .Z()
    .d()
}

export const FLAMES = [
  {
    id: 'flame-rise',
    label: 'Rising Flame',
    tags: ['fire', 'blaze', 'hot', 'rock', 'biker'],
    width: 400,
    height: 560,
    draw() {
      const T = place(200, 500)
      const tongues = [
        [-118, 96, 200, -62],
        [118, 96, 220, 66],
        [-70, 150, 320, -52],
        [74, 150, 345, 58],
        [0, 220, 470, 14],
      ]
      return {
        defs: fireDefs(30, 540),
        body:
          flameStack({ T, tongues, fills: FILLS }) +
          outlined(spark(place(110, 120, -18), 1) + spark(place(300, 96, 22), 0.8) + spark(place(250, 36, 8), 0.6), 'url(#fm)', { width: 4 }),
      }
    },
  },
  {
    id: 'flame-side',
    label: 'Side Flame',
    tags: ['fire', 'wind', 'speed', 'blaze', 'swept'],
    width: 560,
    height: 400,
    draw() {
      const T = place(170, 370)
      const tongues = [
        [-110, 100, 170, 170],
        [-50, 140, 250, 240],
        [20, 170, 320, 300],
        [90, 130, 230, 230],
        [150, 90, 150, 160],
      ]
      return { defs: fireDefs(40, 380), body: flameStack({ T, tongues, fills: FILLS }) }
    },
  },
  {
    id: 'flame-burst',
    label: 'Burst Flame',
    tags: ['fire', 'explosion', 'sun', 'blast', 'radial'],
    width: 520,
    height: 520,
    draw() {
      const parts = []
      const mids = []
      const cores = []
      for (let i = 0; i < 14; i += 1) {
        const long = i % 2 === 0
        const T = place(260, 260, i * (360 / 14), 1)
        const lift = (x, y) => T(x, y - 92)
        const h = long ? 160 : 118
        const w = long ? 92 : 74
        const lean = long ? 22 : -16
        parts.push(P(tongue(lift, w, h, lean)))
        mids.push(P(tongue(lift, w * 0.62, h * 0.7, lean * 0.7)))
        cores.push(P(tongue(lift, w * 0.32, h * 0.4, lean * 0.4)))
      }
      return {
        defs:
          radial('fo', [...FIRE_OUTER].reverse(), [260, 260, 260], true) +
          radial('fm', [...FIRE_MID].reverse(), [260, 260, 220], true) +
          radial('fc', [...FIRE_CORE].reverse(), [260, 260, 150], true) +
          radial('core', ['#fffbe8', '#ffd84d', '#ff8a1a'], [0.45, 0.4, 0.6]),
        body:
          outlined(parts.join('') + circle(260, 260, 112), 'url(#fo)', { width: 7 }) +
          `<g fill="url(#fm)">${mids.join('')}</g><g fill="url(#fc)">${cores.join('')}</g>` +
          circle(260, 260, 100, 'fill="url(#core)"') +
          circle(260, 260, 100, `fill="none" stroke="${INK}" stroke-width="5"`),
      }
    },
  },
  {
    id: 'flame-hotrod',
    label: 'Hot Rod Flames',
    tags: ['fire', 'car', 'racing', 'speed', 'licks', 'vintage'],
    width: 720,
    height: 320,
    draw() {
      const licks = [
        [44, 46, 380, 30],
        [96, 70, 560, 62],
        [152, 72, 680, 70],
        [210, 66, 600, 58],
        [262, 52, 460, 44],
      ]
      const shapes = licks.map(([y, t, L, c]) => P(lick(place(20, y), t, L, c))).join('')
      const pin = licks
        .map(([y, t, L, c]) => P(lick(place(20, y), t * 0.62, L * 0.86, c * 0.7), 'fill="none" stroke="#fff3c4" stroke-width="3"'))
        .join('')
      return {
        defs: linear('hr', ['#ffe066', '#ffb020', '#f05a1a', '#c3161c', '#7d0d14'], [20, 0, 700, 0], true),
        body: outlined(shapes, 'url(#hr)', { width: 6 }) + pin,
      }
    },
  },
  {
    id: 'flame-tribal',
    label: 'Tribal Flame',
    tags: ['fire', 'tattoo', 'tribal', 'black', 'blade'],
    width: 400,
    height: 560,
    draw() {
      const blade = (T, w, h, lean) =>
        path(T)
          .M(-w / 2, 0)
          .C(-w * 0.2, -h * 0.25, -w * 0.9 + lean * 0.2, -h * 0.55, lean, -h)
          .C(lean * 0.2 + w * 0.05, -h * 0.62, w * 0.62, -h * 0.4, w / 2, 0)
          .Q(0, w * 0.18, -w / 2, 0)
          .Z()
          .d()
      const T = place(200, 520)
      const blades = [
        [-110, 90, 230, -90],
        [110, 90, 250, 90],
        [-56, 120, 360, -60],
        [60, 120, 390, 70],
        [0, 150, 500, 10],
      ]
      const solid = blades.map(([dx, w, h, l]) => P(blade((x, y) => T(x + dx, y), w, h, l))).join('')
      const cut = blades
        .map(([dx, w, h, l]) => P(blade((x, y) => T(x + dx + w * 0.08, y - h * 0.1), w * 0.28, h * 0.55, l * 0.5)))
        .join('')
      return { body: `<g fill="${INK}">${solid}</g><g fill="#fffaf0">${cut}</g>` }
    },
  },
  {
    id: 'flame-torch',
    label: 'Torch',
    tags: ['fire', 'light', 'liberty', 'victory', 'sport'],
    width: 360,
    height: 600,
    draw() {
      const T = place(180, 250)
      const tongues = [
        [-52, 80, 150, -30],
        [52, 80, 160, 34],
        [0, 120, 240, 6],
      ]
      const handle = sym([0, 0], [['L', 46, 0], ['L', 26, 280], ['C', 26, 300, 10, 310, 0, 310]], place(180, 330, 0, 1, 1))
      const cup = sym([0, 0], [['L', 92, 0], ['C', 92, 30, 60, 62, 40, 70], ['L', 0, 70]], place(180, 262))
      return {
        defs:
          fireDefs(10, 300) +
          linear('wood', ['#3b2414', '#8a5a33', '#c48a52', '#7a4c27', '#3b2414'], [0, 0, 1, 0]) +
          linear('brass', ['#fff2bf', '#efc560', '#b07c1c', '#f4d57e', '#9a6a14'], [0, 0, 1, 0]),
        body:
          flameStack({ T, tongues, fills: FILLS }) +
          outlined(P(handle), 'url(#wood)', { width: 6 }) +
          [380, 450, 520].map((y) => outlined(rect(180 - 40 + (y - 380) * 0.07, y, 80 - (y - 380) * 0.14, 16, 'rx="5"'), 'url(#brass)', { width: 4 })).join('') +
          outlined(P(cup), 'url(#brass)', { width: 6 }) +
          ellipse(180, 262, 92, 14, `fill="#7a4c27" stroke="${INK}" stroke-width="6"`),
      }
    },
  },
  {
    id: 'flame-candle',
    label: 'Candle',
    tags: ['fire', 'light', 'vigil', 'wax', 'glow', 'gothic'],
    width: 360,
    height: 600,
    draw() {
      const wax = path()
        .M(110, 240)
        .C(110, 228, 250, 228, 250, 240)
        .L(250, 300)
        .C(250, 320, 236, 330, 236, 350)
        .C(236, 372, 250, 372, 250, 360)
        .L(250, 560)
        .L(110, 560)
        .L(110, 320)
        .C(110, 336, 126, 340, 126, 318)
        .C(126, 296, 110, 290, 110, 270)
        .Z()
        .d()
      const T = place(180, 214)
      return {
        defs:
          fireDefs(30, 230) +
          radial('glow', [['#fff3b0', 0], ['#ffd84d', 0.3], ['#ff9a1f', 0.6], ['#ff9a1f00', 1]], [180, 150, 150], true) +
          linear('wax', ['#e9dcc2', '#fffaf0', '#f2e6cc', '#c9b48e'], [0, 0, 1, 0]),
        body:
          circle(180, 150, 150, 'fill="url(#glow)" opacity="0.55"') +
          outlined(P(wax), 'url(#wax)', { width: 6 }) +
          P(path().M(180, 236).L(180, 206).d(), `stroke="${INK}" stroke-width="6" stroke-linecap="round"`) +
          flameStack({ T, tongues: [[0, 64, 170, 8]], fills: FILLS, outline: 5 }) +
          rect(90, 556, 180, 22, `rx="8" fill="#9a6a14" stroke="${INK}" stroke-width="6"`),
      }
    },
  },
  {
    id: 'flame-ring',
    label: 'Ring of Fire',
    tags: ['fire', 'circle', 'frame', 'wreath', 'hoop'],
    width: 520,
    height: 520,
    draw() {
      const outer = []
      const mid = []
      for (let i = 0; i < 24; i += 1) {
        const T = place(260, 260, i * 15)
        const lift = (x, y) => T(x, y - 150)
        const h = i % 3 === 0 ? 100 : i % 3 === 1 ? 74 : 86
        outer.push(P(tongue(lift, 54, h, 18)))
        mid.push(P(tongue(lift, 30, h * 0.66, 12)))
      }
      const ring = ringPath(260, 260, 170) + ringPath(260, 260, 120, true)
      return {
        defs: radial('fo', [['#ff9a1f', 0.5], ['#d7262e', 0.75], ['#a8101a', 1]], [260, 260, 260], true) + radial('fm', [['#ffe36b', 0.55], ['#ff9a1f', 0.8]], [260, 260, 260], true),
        body: outlined(outer.join('') + P(ring, 'fill-rule="evenodd"'), 'url(#fo)', { width: 6 }) + `<g fill="url(#fm)">${mid.join('')}</g>` + circle(260, 260, 145, `fill="none" stroke="#ffe36b" stroke-width="10"`),
      }
    },
  },
  {
    id: 'flame-heart',
    label: 'Flaming Heart',
    tags: ['fire', 'heart', 'love', 'passion', 'tattoo', 'sacred'],
    width: 460,
    height: 560,
    draw() {
      const heart = sym([0, -110], [['C', 30, -170, 170, -170, 170, -50], ['C', 170, 40, 60, 110, 0, 170]], place(230, 360))
      const T = place(230, 250)
      return {
        defs:
          fireDefs(20, 260) +
          radial('heart', ['#ff6b6b', '#d7262e', '#7d0d14'], [0.38, 0.32, 0.75]),
        body:
          flameStack({ T, tongues: [[-70, 90, 170, -40], [70, 90, 180, 44], [0, 130, 250, 6]], fills: FILLS }) +
          outlined(P(heart), 'url(#heart)', { width: 7 }) +
          ellipse(170, 290, 30, 16, 'fill="#fff" opacity="0.55" transform="rotate(-35 170 290)"') +
          P(sym([0, -40], [['L', 10, -40], ['L', 10, -10], ['L', 34, -10], ['L', 34, 4], ['L', 10, 4], ['L', 10, 60], ['L', 0, 60]], place(230, 380)), `fill="#ffd84d" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'flame-wisp',
    label: 'Flame Wisp',
    tags: ['fire', 'smoke', 'swirl', 'elegant', 'spirit'],
    width: 360,
    height: 600,
    draw() {
      const curve = turtle({ x: 180, y: 570, heading: -90, length: 600, k: (s) => 0.0045 * Math.sin(s / 80) + (s > 420 ? -(s - 420) * 0.00022 : 0), steps: 160 })
      const inner = turtle({ x: 186, y: 540, heading: -92, length: 420, k: (s) => 0.0045 * Math.sin(s / 80 + 0.4), steps: 120 })
      return {
        defs: linear('fo', [...FIRE_OUTER].reverse(), [0, 580, 0, 20], true) + linear('fm', [...FIRE_MID].reverse(), [0, 580, 0, 20], true),
        body:
          outlined(P(ribbon(curve, (t) => 4 + 100 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.12)), 0.9) * Math.pow(1 - t, 0.8))), 'url(#fo)', { width: 6 }) +
          P(ribbon(inner, swell(46, 2)), 'fill="url(#fm)"') +
          P(ribbon(inner.slice(10, 90), swell(14, 1)), 'fill="#fff0a8"'),
      }
    },
  },
  {
    id: 'flame-fireball',
    label: 'Fireball',
    tags: ['fire', 'comet', 'meteor', 'speed', 'ball'],
    width: 640,
    height: 400,
    draw() {
      const tongues = []
      const mids = []
      for (let i = 0; i < 7; i += 1) {
        const T = place(470, 200, 0)
        const len = 360 - Math.abs(i - 3) * 60
        const y = (i - 3) * 34
        const tail = (x, yy) => T(-x, yy + y)
        tongues.push(P(lick(tail, 90 - Math.abs(i - 3) * 12, len, (i - 3) * 6)))
        mids.push(P(lick(tail, 50 - Math.abs(i - 3) * 6, len * 0.75, (i - 3) * 4)))
      }
      return {
        defs:
          linear('fo', ['#ffb020', '#f05a1a', '#c3161c', '#7d0d14'], [470, 0, 60, 0], true) +
          linear('fm', ['#fff0a8', '#ffc13a', '#ff6a13'], [470, 0, 160, 0], true) +
          radial('ball', ['#fffbe8', '#ffe36b', '#ff9a1f', '#d7262e'], [0.42, 0.4, 0.62]),
        body:
          outlined(tongues.join('') + circle(480, 200, 110), 'url(#fo)', { width: 6 }) +
          `<g fill="url(#fm)">${mids.join('')}</g>` +
          circle(480, 200, 100, 'fill="url(#ball)"'),
      }
    },
  },
].map((g) => ({ ...g, category: 'flames' }))

