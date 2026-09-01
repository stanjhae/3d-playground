# Fashion Leader Vote — send package

Live URL: https://3d-playground-vert.vercel.app/

Local: `pnpm dev` → http://127.0.0.1:5173/

## Wow bar

Run as a person who has never seen the repo. Phone and laptop. House voice only.

Checks below are against the live URL. Production is this house.

| Check | Live | Notes |
| --- | --- | --- |
| Gown reads as clothing from ~2 meters | Pass | Style3D White Evening Gown Dress: floor-length, criss-cross halter, keyhole bust. Credited CC BY 4.0. |
| First paint is full-bleed studio; gown in frame; wordmark only | Pass | No manifesto. Wordmark floats. |
| Silk without a tutorial | Pass | Body is preselected. Silk is live on first tap. Title becomes Silk 01. |
| Stills match the 3D look | Pass | Publish captures a 4:5 JPEG of the live gown. House board cards are still the painted column stills. |
| Publish survives reload | Pass | Production KV is on. `Ivory Silk Proof 20260901T065652Z` stayed. This run entered `look-0b08a0a7-fcbf-485d-87c0-6606cb78e37a`. |
| Look nav never 404s | Pass | Look is the current look or the Leader. Never `/look/preview`. |
| iMessage / Slack unfurl | Pass | Crawler HTML says Fashion Leader Vote. Home uses `/og-default.png`. House looks use `/api/og?lookId=`. A human Slack paste is still #52. |
| 390px studio is usable | Pass | Live 390×844: Silk and Enter the Vote are 44px. Look never goes to `/look/preview`. |
| Would you text this URL to a fashion person? | Pass | The live studio is evening-wear. The leftover that would have stopped the forward was #39. |

## 90-second shot list

1. Open the studio. A white evening gown fills the frame. Fashion Leader Vote. No captured cursor.
2. Tap **Silk**. The cloth takes sheen. The title becomes Silk 01.
3. **Enter the Vote**. Your still sits on the board. **Just entered** marks it.
4. Vote **Atelier Ivory**. The Leader stamp can move.
5. Open **Midnight Silk Column**. Orbit. Remix in studio. The caption says what you are remixing.
6. Optional: **The house** — the Leader on a plinth. **Walk the rooms** only if you want it.
7. Optional: **Jacket** — the house has a second form.

## Cover note

Subject: https://3d-playground-vert.vercel.app/

This is Create / Publish / Vote as a URL.

You land on a gown, not a building. Cloth names, not sliders. Enter the vote and the board already looks like a house. One vote can name a Leader. The look link stands alone.

I did not build CAD, pattern grading, cloth simulation, or AI. There is no login.

## Leftover risk

- #52 needs a human Slack or iMessage paste. Crawler meta is not that paste.
- House board cards are still the painted column stills. Publish captures the live gown.
- The live board caps at 24 looks. Memory fallback still keeps the seven house looks locally and in tests.
- The look route loads Three (~270KB gzip). The house rooms load only when you walk them.
- Header Atelier / Vote / Look measure under 44px. Card Vote buttons do not.
- #54 is optional polish and does not change the forward.
