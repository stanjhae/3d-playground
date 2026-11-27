import {
  INK,
  OX,
  P,
  BRASS,
  PAPER,
  circle,
  ellipse,
  linear,
  path,
  place,
  radial,
  ribbon,
  sym,
  turtle,
} from './draw.mjs'

const LEAF_GREEN = ['#8fbf5a', '#5e8c3a', '#2f5a24']

/** A pointed leaf from (0, 0) up to (0, -L). */
const leafShape = (T, w, L) => sym([0, -L], [['C', w * 0.55, -L * 0.8, w * 0.6, -L * 0.25, 0, 0]], T)

function leaf(T, w, L, fill = 'url(#lf)', veins = true) {
  let out = P(leafShape(T, w, L), `fill="${fill}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`)
  if (veins) {
    out += P(path(T).M(0, -4).Q(w * 0.04, -L * 0.5, 0, -L * 0.9).d(), `fill="none" stroke="#24461b" stroke-width="2.5"`)
    for (let i = 1; i <= 3; i += 1) {
      const y = -L * (0.2 + i * 0.18)
      out += P(path(T).M(0, y).Q(w * 0.18, y - L * 0.05, w * 0.32, y - L * 0.14).M(0, y).Q(-w * 0.18, y - L * 0.05, -w * 0.32, y - L * 0.14).d(), `fill="none" stroke="#24461b" stroke-width="1.5" opacity="0.7"`)
    }
  }
  return out
}

/** A rounded petal from (0, 0) up to (0, -L). */
const petal = (T, w, L) => sym([0, -L], [['C', w * 0.45, -L, w * 0.62, -L * 0.6, w * 0.4, -L * 0.25], ['C', w * 0.25, -L * 0.05, w * 0.1, 0, 0, 0]], T)

/** A notched cherry-blossom petal. */
const notched = (T, w, L) =>
  sym([0, -L * 0.86], [['C', w * 0.12, -L * 0.98, w * 0.3, -L, w * 0.45, -L * 0.92], ['C', w * 0.62, -L * 0.7, w * 0.4, -L * 0.25, 0, 0]], T)

function phyllo(cx, cy, n, spread, r, fill) {
  let out = ''
  for (let i = 1; i <= n; i += 1) {
    const a = i * 2.39996
    const d = spread * Math.sqrt(i)
    out += circle(cx + d * Math.cos(a), cy + d * Math.sin(a), r * (0.6 + 0.4 * Math.sqrt(i / n)), `fill="${fill}"`)
  }
  return out
}

export const FLORALS = [
  {
    id: 'rose',
    label: 'Rose',
    tags: ['rose', 'flower', 'romance', 'red', 'tattoo', 'bloom'],
    width: 520,
    height: 520,
    draw() {
      let body = ''
      body += leaf(place(260, 260, 210), 110, 230) + leaf(place(260, 260, 140), 100, 220) + leaf(place(260, 260, 290), 90, 200)
      const rings = [
        [5, 190, 200, 0, 'url(#p0)'],
        [5, 150, 160, 36, 'url(#p1)'],
        [5, 112, 120, 10, 'url(#p2)'],
        [4, 80, 84, 50, 'url(#p3)'],
        [3, 56, 56, 20, 'url(#p3)'],
      ]
      for (const [n, w, L, offset, fill] of rings) {
        for (let i = 0; i < n; i += 1) {
          const T = place(260, 260, offset + (i * 360) / n)
          body += P(petal(T, w * 1.25, L), `fill="${fill}" stroke="#4a0a14" stroke-width="3.5" stroke-linejoin="round"`)
          body += P(path(T).M(-w * 0.35, -L * 0.88).Q(0, -L * 0.98, w * 0.35, -L * 0.88).d(), 'fill="none" stroke="#ff9aa6" stroke-width="3" opacity="0.6"')
        }
      }
      const swirl = turtle({ x: 260, y: 236, heading: 0, length: 150, k: (s) => 0.09 - s * 0.0004, steps: 60 })
      body += P(ribbon(swirl, (t) => 9 * (1 - t) + 2), 'fill="#4a0a14"')
      return {
        defs:
          radial('p0', ['#b3123a', '#d7263e', '#f25a6a'], [260, 260, 200], true) +
          radial('p1', ['#8e0f2e', '#c3163a', '#e8475a'], [260, 260, 160], true) +
          radial('p2', ['#700b24', '#a8102f', '#d7263e'], [260, 260, 120], true) +
          radial('p3', ['#4d0718', '#8e0f2e', '#c3163a'], [260, 260, 84], true) +
          linear('lf', LEAF_GREEN, [0, 0, 1, 1]),
        body,
      }
    },
  },
  {
    id: 'daisy',
    label: 'Daisy',
    tags: ['daisy', 'flower', 'spring', 'white', 'retro', 'hippie'],
    width: 500,
    height: 500,
    draw() {
      let back = ''
      let front = ''
      for (let i = 0; i < 26; i += 1) {
        back += P(petal(place(250, 250, i * (360 / 26) + 7), 48, 210), `fill="#e9e4da" stroke="${INK}" stroke-width="3"`)
      }
      for (let i = 0; i < 22; i += 1) {
        front += P(petal(place(250, 250, i * (360 / 22)), 50, 196), `fill="url(#w)" stroke="${INK}" stroke-width="3.5"`)
        front += P(path(place(250, 250, i * (360 / 22))).M(0, -70).L(0, -170).d(), 'stroke="#c9c2b2" stroke-width="2"')
      }
      return {
        defs: linear('w', ['#ffffff', '#f6f2e8', '#e2dccd']) + radial('c', ['#ffe36b', '#f5b312', '#c9741a'], [0.45, 0.4, 0.6]),
        body: back + front + circle(250, 250, 70, `fill="url(#c)" stroke="${INK}" stroke-width="5"`) + phyllo(250, 250, 90, 6.5, 4.5, '#b05a12'),
      }
    },
  },
  {
    id: 'sunflower',
    label: 'Sunflower',
    tags: ['sunflower', 'flower', 'summer', 'yellow', 'sun', 'garden'],
    width: 520,
    height: 520,
    draw() {
      const pointed = (T, w, L) => sym([0, -L], [['C', w * 0.3, -L * 0.8, w * 0.6, -L * 0.45, w * 0.42, 0]], T)
      let body = ''
      for (let i = 0; i < 20; i += 1) body += P(pointed(place(260, 260, i * 18 + 9), 64, 236), `fill="#e8a317" stroke="${INK}" stroke-width="3.5"`)
      for (let i = 0; i < 20; i += 1) body += P(pointed(place(260, 260, i * 18), 64, 220), `fill="url(#y)" stroke="${INK}" stroke-width="3.5"`)
      for (let i = 0; i < 20; i += 1) body += P(path(place(260, 260, i * 18)).M(0, -120).L(0, -200).d(), 'stroke="#c9741a" stroke-width="2.5"')
      return {
        defs: radial('y', ['#fff0a8', '#ffd23f', '#f5a312'], [260, 260, 240], true) + radial('c', ['#7a4a1c', '#4a2a10', '#2a170a'], [0.5, 0.5, 0.5]),
        body: body + circle(260, 260, 112, `fill="url(#c)" stroke="${INK}" stroke-width="5"`) + phyllo(260, 260, 240, 6.8, 4.2, '#c9873a'),
      }
    },
  },
  {
    id: 'lotus',
    label: 'Lotus',
    tags: ['lotus', 'flower', 'zen', 'yoga', 'pink', 'spiritual'],
    width: 560,
    height: 440,
    draw() {
      const pointed = (T, w, L) => sym([0, -L], [['C', w * 0.3, -L * 0.75, w * 0.62, -L * 0.45, w * 0.5, -L * 0.1], ['C', w * 0.4, 0, w * 0.2, 0, 0, 0]], T)
      let body = ''
      const layers = [
        [[-78, 140, 220], [78, 140, 220]],
        [[-54, 130, 250], [54, 130, 250]],
        [[-28, 120, 280], [28, 120, 280]],
        [[0, 130, 300]],
      ]
      const fills = ['url(#p3)', 'url(#p2)', 'url(#p1)', 'url(#p0)']
      layers.forEach((layer, i) => {
        for (const [angle, w, L] of layer) {
          const T = place(280, 360, angle)
          body += P(pointed(T, w, L), `fill="${fills[i]}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`)
          body += P(path(T).M(0, -12).Q(w * 0.06, -L * 0.5, 0, -L * 0.82).d(), 'fill="none" stroke="#c94f7a" stroke-width="2.5" opacity="0.6"')
        }
      })
      const pad = path().M(60, 370).C(120, 330, 440, 330, 500, 370).C(440, 420, 120, 420, 60, 370).Z().d()
      return {
        defs:
          linear('p0', ['#fff0f4', '#f7a8c0', '#e0668f']) +
          linear('p1', ['#ffe6ee', '#f39ab6', '#d65684']) +
          linear('p2', ['#fbd6e2', '#ea86a8', '#c94f7a']) +
          linear('p3', ['#f6c4d5', '#dd7398', '#b23e66']) +
          linear('lf', LEAF_GREEN, [0, 0, 0, 1]),
        body: P(pad, `fill="url(#lf)" stroke="${INK}" stroke-width="4"`) + body,
      }
    },
  },
  {
    id: 'tulip',
    label: 'Tulip',
    tags: ['tulip', 'flower', 'spring', 'red', 'stem', 'garden'],
    width: 400,
    height: 600,
    draw() {
      const stem = turtle({ x: 200, y: 580, heading: -90, length: 360, k: (s) => 0.0012 * Math.sin(s / 60), steps: 60 })
      const cup = path()
        .M(120, 120)
        .C(110, 200, 130, 260, 200, 270)
        .C(270, 260, 290, 200, 280, 120)
        .C(260, 150, 240, 150, 232, 110)
        .C(220, 140, 180, 140, 168, 110)
        .C(160, 150, 140, 150, 120, 120)
        .Z()
        .d()
      const middle = path().M(168, 110).C(150, 60, 190, 30, 200, 26).C(210, 30, 250, 60, 232, 110).C(226, 160, 174, 160, 168, 110).Z().d()
      return {
        defs: linear('r', ['#ff7a7a', '#d7262e', '#8e0f1e'], [0, 0, 0, 1]) + linear('r2', ['#ffb0a0', '#e8474f', '#a8101a'], [0, 0, 0, 1]) + linear('lf', LEAF_GREEN, [0, 0, 1, 1]),
        body:
          P(ribbon(stem, () => 14), `fill="#4f7a30" stroke="${INK}" stroke-width="3.5"`) +
          leaf(place(196, 560, -32), 90, 300, 'url(#lf)', false) +
          leaf(place(204, 540, 38), 80, 260, 'url(#lf)', false) +
          P(middle, `fill="url(#r2)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`) +
          P(cup, `fill="url(#r)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`) +
          P(path().M(200, 150).C(196, 200, 198, 240, 200, 266).d(), 'fill="none" stroke="#8e0f1e" stroke-width="3" opacity="0.6"') +
          ellipse(150, 170, 10, 34, 'fill="#fff" opacity="0.35" transform="rotate(-10 150 170)"'),
      }
    },
  },
  {
    id: 'cherry-blossom',
    label: 'Cherry Blossom',
    tags: ['cherry blossom', 'sakura', 'flower', 'japan', 'pink', 'spring'],
    width: 520,
    height: 480,
    draw() {
      const flower = (cx, cy, s, turn) => {
        let out = ''
        for (let i = 0; i < 5; i += 1) out += P(notched(place(cx, cy, turn + i * 72, s), 120, 120), `fill="url(#pk)" stroke="${INK}" stroke-width="${3.5 / s}" stroke-linejoin="round"`)
        for (let i = 0; i < 10; i += 1) {
          const T = place(cx, cy, turn + i * 36 + 18, s)
          out += P(path(T).M(0, 0).L(0, -46).d(), `stroke="#b23e66" stroke-width="${2.5}"`)
          const [x, y] = T(0, -48)
          out += circle(x, y, 5 * s, `fill="#ffd23f" stroke="${INK}" stroke-width="1.5"`)
        }
        return out + circle(cx, cy, 14 * s, `fill="#e0668f"`)
      }
      const branch = turtle({ x: 0, y: 420, heading: -20, length: 520, k: (s) => 0.0016 * Math.sin(s / 90), steps: 80 })
      const twig = turtle({ x: 260, y: 310, heading: -70, length: 160, k: () => 0.002, steps: 30 })
      return {
        defs: radial('pk', ['#ffffff', '#fbd6e2', '#f39ab6'], [0.5, 0.95, 1]),
        body:
          P(ribbon(branch, (t) => 30 - 20 * t), `fill="#4a2a1c" stroke="${INK}" stroke-width="3"`) +
          P(ribbon(twig, (t) => 14 - 9 * t), `fill="#4a2a1c" stroke="${INK}" stroke-width="3"`) +
          flower(180, 300, 1.1, 10) +
          flower(370, 170, 0.9, 40) +
          flower(300, 360, 0.6, 0) +
          ellipse(460, 120, 16, 26, `fill="#f39ab6" stroke="${INK}" stroke-width="3" transform="rotate(40 460 120)"`),
      }
    },
  },
  {
    id: 'hibiscus',
    label: 'Hibiscus',
    tags: ['hibiscus', 'flower', 'tropical', 'hawaii', 'summer', 'aloha'],
    width: 520,
    height: 520,
    draw() {
      const wavy = (T) =>
        path(T)
          .M(0, 0)
          .C(-80, -40, -150, -150, -100, -205)
          .C(-70, -235, -40, -215, -20, -232)
          .C(0, -248, 30, -226, 50, -238)
          .C(90, -250, 120, -200, 106, -160)
          .C(90, -100, 50, -40, 0, 0)
          .Z()
          .d()
      let body = ''
      for (let i = 0; i < 5; i += 1) {
        const T = place(260, 270, i * 72 + 8)
        body += P(wavy(T), `fill="url(#h)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`)
        for (const dx of [-40, 0, 40]) body += P(path(T).M(0, -20).Q(dx * 0.6, -110, dx, -190).d(), 'fill="none" stroke="#8e0f1e" stroke-width="2" opacity="0.5"')
      }
      const stamen = turtle({ x: 260, y: 270, heading: -60, length: 170, k: () => -0.003, steps: 30 })
      let pollen = ''
      const tip = stamen[stamen.length - 1]
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2
        pollen += circle(tip[0] + 18 * Math.cos(a), tip[1] + 18 * Math.sin(a), 7, `fill="#ffd23f" stroke="${INK}" stroke-width="2"`)
      }
      return {
        defs: radial('h', [['#5a0414', 0], ['#a8101a', 0.25], ['#e8474f', 0.6], ['#ff8a7a', 1]], [260, 270, 250], true),
        body: body + P(ribbon(stamen, () => 10), `fill="#f5c84a" stroke="${INK}" stroke-width="3"`) + pollen + circle(tip[0], tip[1], 10, 'fill="#c9741a"'),
      }
    },
  },
  {
    id: 'leaf-sprig',
    label: 'Leaf Sprig',
    tags: ['leaf', 'sprig', 'olive', 'botanical', 'green', 'nature'],
    width: 400,
    height: 600,
    draw() {
      const stem = turtle({ x: 210, y: 580, heading: -96, length: 540, k: (s) => 0.0005 + 0.0012 * Math.sin(s / 80), steps: 90 })
      let leaves = ''
      for (let i = 0; i < 9; i += 1) {
        const idx = Math.round(10 + i * 9)
        const [x, y] = stem[idx]
        const [px, py] = stem[idx - 2]
        const heading = (Math.atan2(y - py, x - px) * 180) / Math.PI + 90
        const side = i % 2 ? 1 : -1
        const size = 1 - i * 0.06
        leaves += leaf(place(x, y, heading + side * 48), 70 * size, 160 * size)
      }
      const [tx, ty] = stem[stem.length - 1]
      return {
        defs: linear('lf', LEAF_GREEN, [0, 0, 1, 1]),
        body: P(ribbon(stem, (t) => 12 - 8 * t), `fill="#4f7a30" stroke="${INK}" stroke-width="3"`) + leaves + leaf(place(tx, ty, 10), 56, 110),
      }
    },
  },
  {
    id: 'fern',
    label: 'Fern',
    tags: ['fern', 'leaf', 'botanical', 'forest', 'green', 'nature'],
    width: 420,
    height: 600,
    draw() {
      const rachis = turtle({ x: 160, y: 590, heading: -80, length: 560, k: (s) => 0.0011 + s * 0.0000025, steps: 100 })
      let pinnae = ''
      for (let i = 4; i < 96; i += 4) {
        const [x, y] = rachis[i]
        const [px, py] = rachis[i - 2]
        const heading = (Math.atan2(y - py, x - px) * 180) / Math.PI + 90
        const t = i / 100
        const L = 150 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (1 - t * 0.5) + 14
        for (const side of [-1, 1]) {
          pinnae += P(leafShape(place(x, y, heading + side * 62), L * 0.32, L), `fill="url(#lf)" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`)
        }
      }
      return {
        defs: linear('lf', LEAF_GREEN, [0, 0, 1, 1]),
        body: pinnae + P(ribbon(rachis, (t) => 9 - 7 * t), `fill="#3f6b2a" stroke="${INK}" stroke-width="2.5"`),
      }
    },
  },
  {
    id: 'vine-border',
    label: 'Vine Border',
    tags: ['vine', 'border', 'leaves', 'botanical', 'trim', 'stripe'],
    width: 800,
    height: 240,
    draw() {
      const stem = []
      for (let i = 0; i <= 160; i += 1) {
        const x = 20 + (760 * i) / 160
        stem.push([x, 120 + 42 * Math.sin((x - 20) / 60)])
      }
      let deco = ''
      for (let k = 0; k < 12; k += 1) {
        const i = 6 + k * 13
        const [x, y] = stem[i]
        const [px, py] = stem[i - 1]
        const heading = (Math.atan2(y - py, x - px) * 180) / Math.PI
        const side = k % 2 ? 1 : -1
        deco += leaf(place(x, y, heading + 90 + side * 60), 34, 72, 'url(#lf)', false)
        if (k % 3 === 1) {
          const curl = turtle({ x, y, heading: heading + side * 70, length: 90, k: (s) => side * (0.01 + s * 0.0012), steps: 40 })
          deco += P(ribbon(curl, (t) => 5 - 4 * t), `fill="#3f6b2a"`)
        }
        if (k % 4 === 2) {
          const [bx, by] = place(x, y, heading + 90 - side * 70)(0, -40)
          deco += circle(bx, by, 10, `fill="${OX}" stroke="${INK}" stroke-width="2.5"`) + circle(bx + 14, by + 8, 8, `fill="${OX}" stroke="${INK}" stroke-width="2.5"`)
        }
      }
      return {
        defs: linear('lf', LEAF_GREEN, [0, 0, 1, 1]),
        body: P(ribbon(stem, () => 8), `fill="#3f6b2a" stroke="${INK}" stroke-width="2"`) + deco,
      }
    },
  },
  {
    id: 'paisley',
    label: 'Paisley',
    tags: ['paisley', 'boteh', 'bandana', 'boho', 'indian', 'pattern'],
    width: 440,
    height: 560,
    draw() {
      const drop = (s) =>
        path(place(220, 330, 0, s))
          .M(0, 180)
          .C(-150, 180, -180, 30, -140, -60)
          .C(-100, -150, 20, -170, 60, -230)
          .C(90, -270, 150, -250, 140, -200)
          .C(132, -168, 96, -170, 100, -150)
          .C(170, -110, 180, -10, 150, 60)
          .C(120, 140, 60, 180, 0, 180)
          .Z()
          .d()
      let dots = ''
      for (let i = 0; i < 26; i += 1) {
        const t = i / 25
        const a = Math.PI * (0.5 + 1.6 * t)
        dots += circle(220 + 120 * Math.cos(a) * 0.9, 330 + 120 * Math.sin(a) * 1.05 - 20 * t, 6, `fill="${PAPER}"`)
      }
      let petals = ''
      for (let i = 0; i < 8; i += 1) petals += P(petal(place(214, 360, i * 45), 34, 52), `fill="${BRASS}" stroke="${INK}" stroke-width="2.5"`)
      return {
        body:
          P(drop(1), `fill="${OX}" stroke="${INK}" stroke-width="6"`) +
          dots +
          P(drop(0.72), `fill="#e8c4b8" stroke="${INK}" stroke-width="4"`) +
          P(drop(0.5), `fill="#2f5d8a" stroke="${INK}" stroke-width="4"`) +
          petals +
          circle(214, 360, 14, `fill="${PAPER}" stroke="${INK}" stroke-width="3"`),
      }
    },
  },
  {
    id: 'monstera',
    label: 'Monstera Leaf',
    tags: ['monstera', 'leaf', 'tropical', 'jungle', 'plant', 'green'],
    width: 520,
    height: 560,
    draw() {
      const outline = path()
        .M(250, 530)
        .C(120, 480, 30, 360, 40, 230)
        .C(50, 110, 160, 30, 270, 30)
        .C(400, 30, 490, 130, 488, 260)
        .C(486, 390, 390, 480, 270, 520)
        .Z()
        .d()
      const cuts = []
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i += 1) {
          const y = 150 + i * 96
          const x0 = 265 + side * (46 + i * 8)
          const x1 = 265 + side * 270
          const w = 16 + i * 4
          cuts.push(P(path().M(x0, y).Q(x0 + side * 90, y - 30, x1, y - 90).L(x1, y - 90 + w * 2.2).Q(x0 + side * 100, y - 10 + w, x0 + side * 4, y + w * 0.6).Q(x0 - side * 6, y + w * 0.3, x0, y).Z().d()))
          if (i < 3) cuts.push(ellipse(265 + side * 110, y + 40, 13, 24, `transform="rotate(${side * 40} ${265 + side * 110} ${y + 40})"`))
        }
      }
      return {
        defs:
          `<mask id="cut"><rect width="520" height="560" fill="#fff"/><g fill="#000">${cuts.join('')}</g></mask>` +
          `<clipPath id="leaf"><path d="${outline}"/></clipPath>` +
          linear('lf', ['#7fb04a', '#3f7a2a', '#1f4a1a'], [0, 0, 1, 1]),
        body:
          `<g mask="url(#cut)">${P(outline, `fill="url(#lf)" stroke="${INK}" stroke-width="8"`)}` +
          `<g clip-path="url(#leaf)" fill="none" stroke="${INK}" stroke-width="8">${cuts.join('')}</g></g>` +
          P(path().M(265, 545).Q(250, 300, 268, 40).d(), `fill="none" stroke="#a8cf6a" stroke-width="7" stroke-linecap="round"`),
      }
    },
  },
].map((g) => ({ ...g, category: 'florals' }))

