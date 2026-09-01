# Fashion Leader Vote — send package

Live URL: https://3d-playground-vert.vercel.app/

Local: `pnpm dev` → http://127.0.0.1:5173/

## Wow bar

Run as a person who has never seen the repo. Phone and laptop. House voice only.

Checks below are against the live URL. Production is this house.

| Check | Local | Notes |
| --- | --- | --- |
| Gown reads as clothing from ~2 meters | Pass | Column gown: bodice, skirt, train, lining, straps, hardware. Still authored, not a scanned sample. |
| First paint is full-bleed studio; gown in frame; wordmark only | Pass | No manifesto. Wordmark floats. |
| Silk without a tutorial | Pass | Body is preselected. Silk is live on first tap. |
| Stills match the 3D look | Pass | Board cards are `/stills/*.png` studio cards, not SVG clip-art. Publish captures a 4:5 JPEG. |
| Publish survives reload | Pass | Production KV is on. `Ivory Silk Proof 20260901T065652Z` (`look-7df357c7-4d02-4643-9a64-a8f283bd2d0b`) stayed on the board after reload and a second fetch. |
| Look nav never 404s | Pass | Look is the current look or the Leader. Never `/look/preview`. |
| iMessage / Slack unfurl | Pass | PNG card at `/og-default.png`. Look URLs serve `/api/og?lookId=` stills to crawlers. |
| 390px studio is usable | Pass | Cloth sheet, sticky enter, 44px targets. Gown stays in the upper frame. |
| Would you text this URL to a fashion person? | Fail | Honest Pass only after the live URL is this checkout and KV is on. Locally it is a house. |

## 90-second shot list

1. Open the studio. A gown fills the frame. Fashion Leader Vote. No captured cursor.
2. Tap **Silk**. The column changes.
3. **Enter the Vote**. Your still sits on the board. **Just entered** marks it.
4. Vote **Atelier Ivory**. The Leader stamp can move.
5. Open a look. Orbit. Remix in studio. The caption says what you are remixing.
6. Optional: **The house** — the Leader on a plinth. **Walk the rooms** only if you want it.
7. Optional: **Jacket** — the house has a second form.

## Cover note

Subject: https://3d-playground-vert.vercel.app/

This is Create / Publish / Vote as a URL.

You land on a gown, not a building. Cloth names, not sliders. Enter the vote and the board already looks like a house. One vote can name a Leader. The look link stands alone.

I did not build CAD, pattern grading, cloth simulation, or AI. There is no login.

## Leftover risk

- The live board persists on Upstash when the Production KV env pair is set. Memory fallback still keeps the seven house looks locally and in tests. The live board caps at 24 looks.
- Seed share links always work.
- The look route loads Three (~270KB gzip). Campus GLBs load only in The house.
