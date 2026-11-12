/**
 * Every word on the landing page, in one place (docs/claims-audit.md). The
 * sections, the prerendered HTML, the FAQ structured data and the claims
 * test all read from here, so what search engines read and what people see
 * can't drift apart. `claim` mirrors the audit: `working` is in the alpha
 * today; `concept` must be shown with a Concept preview badge.
 */

export type ClaimState = 'working' | 'concept'

export type LandingFaqItem = { question: string; answer: string }

export const LANDING_SEO = {
  title: 'Design a T-shirt in 3D · Fashion Leader Vote',
  /** The landing's tab label; `pageTitle` adds the brand. */
  label: 'Design a T-shirt in 3D',
  description:
    'Sketch on a 3D T-shirt in your browser. Add words, graphics and colour to the front, back and sleeves, then publish a link and let people vote.',
  imageAlt: 'Fashion Leader Vote: sketch it, see it in 3D, put it to the vote.',
} as const

export const LANDING_NAV = [
  { href: '#flow', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#vote', label: 'Voting' },
  { href: '#faq', label: 'FAQ' },
] as const

export const LANDING_COPY = {
  hero: {
    eyebrow: '3D T-shirt studio · Early alpha',
    lines: ['Sketch it.', 'See it in 3D.'],
    accent: 'Put it to the vote.',
    lead:
      'Draw, type or drop a graphic on a T-shirt and watch it change in 3D as you go. No pattern-making, nothing to install.',
    tryIt: 'Try it right here, no sign-up.',
    cta: 'Start creating',
    ctaNote: 'Sign in with an email code. Your sketch comes with you.',
    secondary: 'See how it works',
    proof: ['Front, back and both sleeves', 'Private until you publish', 'Runs in your browser'],
    padLabel: 'Draw here',
    padHint: 'It lands on the front of the tee.',
    inkLabel: 'Ink',
    graphicsLabel: 'Drop a graphic',
    viewsLabel: 'Turn it',
    live: 'Live',
    spin: 'Spin it in 3D',
    drag: 'Drag to turn it',
    loading: 'Loading 3D…',
    posterAlt:
      'A white T-shirt on a mannequin with a red gothic cross and flames printed on the front',
    noWebgl: 'This browser can’t show 3D. You can still sketch, and the studio explains what it needs.',
    sceneFailed: 'The 3D preview couldn’t start here. Your sketch still works, and Start creating opens the full studio.',
  },
  steps: {
    eyebrow: 'How it works',
    title: 'From idea to garment to crowd.',
    lead: 'Three moves. No design degree required.',
    items: [
      {
        number: '01',
        name: 'Idea',
        title: 'Draw, type or drop in a graphic.',
        body: 'Brush, eraser and fill. Your own words. Curated graphics, or your own PNG or JPEG.',
      },
      {
        number: '02',
        name: 'Garment',
        title: 'See it on the tee, live.',
        body: 'Every stroke lands on a 3D T-shirt as you make it. Turn it around and design the front, back and both sleeves.',
      },
      {
        number: '03',
        name: 'Crowd',
        title: 'Publish a link. Collect votes.',
        body: 'When a version feels right, publish it. It gets its own page, a share card and a vote button.',
      },
    ],
  },
  features: {
    eyebrow: 'The studio',
    title: 'Everything you need to design a tee.',
    titleAccent: 'Nothing you need to learn.',
    lead: 'One screen, four tools, and the garment right beside you the whole time.',
    items: [
      {
        id: 'words',
        claim: 'working' as ClaimState,
        name: 'Words',
        title: 'Type it, place it, own it.',
        body: 'Text layers in a choice of type faces, placed exactly where you want them, at exactly the size you want.',
      },
      {
        id: 'graphics',
        claim: 'concept' as ClaimState,
        name: 'Graphics',
        title: 'Start from a mark.',
        body: 'A curated library of crosses, flames and shapes, or upload your own image.',
      },
      {
        id: 'layers',
        claim: 'working' as ClaimState,
        name: 'Layers',
        title: 'Stack, lock, flip, snap.',
        body: 'Reorder layers, lock what’s finished, mirror and snap to the panel. Undo and redo as you go.',
      },
      {
        id: 'live',
        claim: 'working' as ClaimState,
        name: 'Live 3D',
        title: 'Turn it around before anyone sees it.',
        body: 'Every side previews on the tee while you work, in a solid colour, stripes or check. Versions save as you go.',
      },
    ],
  },
  vote: {
    boardLink: 'See the rankings and vote',
    eyebrow: 'Voting',
    title: 'Make something.',
    titleAccent: 'Let people vote on it.',
    body:
      'Publishing turns a saved version into a public page: front, back and sleeve views, a share card for chats and socials, and a vote button. Anyone with the link can look. Signed-in people vote once each, and can take it back. Unpublish whenever you like.',
    points: ['Its own page and link', 'A share card for chats and socials', 'One vote per account'],
    cardLabel: 'Illustration',
    cardTitle: 'Your design',
    cardByline: 'By you · version 1',
    cardVote: 'Vote',
    fine: 'Vote counts come from real accounts, never seeded.',
  },
  alpha: {
    eyebrow: 'Honest alpha',
    title: 'An early alpha, built in the open.',
    items: [
      { title: 'Private by default.', body: 'Only you see your designs until you publish a saved version.' },
      { title: 'No password.', body: 'Sign in with a one-time code sent to your email.' },
      { title: 'Yours to remove.', body: 'Unpublish a design or delete your account at any time.' },
      {
        title: 'A design studio, not a shop.',
        body: 'FLV doesn’t print, sell or ship garments. The 3D view is a preview, not a fit or manufacturing render.',
      },
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions, answered.',
    items: [
      {
        question: 'Do I need design or pattern-making skills?',
        answer:
          'No. You draw, type and place graphics on a ready-made T-shirt and see the result in 3D straight away.',
      },
      {
        question: 'What can I design right now?',
        answer:
          'One T-shirt: front, back and both sleeves. A base colour, solid or with stripes or check. Drawing, words, curated graphics and your own images.',
      },
      {
        question: 'Do I need to install anything?',
        answer:
          'No. It runs in a modern browser. The 3D preview needs WebGL; without it you can still sketch, but publishing needs the preview.',
      },
      {
        question: 'Why do I need to sign in?',
        answer:
          'To save designs to your account and publish them. Enter your email and type the code we send. There is no password, and a new account is created the first time you sign in.',
      },
      {
        question: 'Who can see my designs?',
        answer:
          'Only you, until you publish a saved version. A published design can be seen by anyone with its link. Shared pages are kept out of search engines.',
      },
      {
        question: 'How does voting work?',
        answer:
          'Each published design has a vote button. Signed-in people get one vote per design and can take it back. Votes stay when you publish a new version.',
      },
      {
        question: 'Can I get my design printed?',
        answer:
          'Not with FLV. There’s no printing, ordering or shipping, and the 3D preview isn’t a manufacturing file.',
      },
      {
        question: 'Can I delete my data?',
        answer:
          'Yes. Unpublish any design, or delete your account from My Studio. The Privacy page explains what is stored.',
      },
      {
        question: 'What’s the waitlist for?',
        answer: 'Leave your email to hear when there’s news. There’s no invite or date yet.',
      },
    ] satisfies LandingFaqItem[],
  },
  final: {
    title: 'Your first design is',
    titleAccent: 'one sketch away.',
    cta: 'Start creating',
    note: 'Sign in with an email code. No password.',
    waitlistLabel: 'Not ready yet? Get news by email.',
    waitlistLead: 'Leave your email to hear when there’s news. There’s no invite or date yet.',
    waitlistField: 'Email',
    waitlistPlaceholder: 'you@example.com',
    waitlistButton: 'Join the waitlist',
  },
  footer: {
    tagline: 'Sketch it. See it in 3D. Put it to the vote.',
    alpha: 'Fashion Leader Vote is an early alpha.',
    product: 'Product',
    studio: 'Studio',
    legal: 'Legal',
    credits: 'Credits',
  },
} as const

/** Every visible string, for the claims test and the prerender guard. */
export function allLandingStrings(): string[] {
  const out: string[] = []

  function walk(value: unknown) {
    if (typeof value === 'string') {
      out.push(value)
    } else if (Array.isArray(value)) {
      value.forEach(walk)
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk)
    }
  }

  walk(LANDING_SEO)
  walk(LANDING_NAV)
  walk(LANDING_COPY)
  return out
}
