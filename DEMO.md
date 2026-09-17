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
| Stills match the 3D look | Pass | Publish captures a 4:5 JPEG of the live look. House cards are studio stills, including Cotton and Leather. |
| Publish survives reload | Pass | Production KV is on. `Ivory Silk Proof 20260901T065652Z` stayed. This run entered `look-0b08a0a7-fcbf-485d-87c0-6606cb78e37a`. |
| Look nav never 404s | Pass | Look is the current look or the Leader. Never `/look/preview`. |
| iMessage / Slack unfurl | Pass | Crawler HTML names the look, the recipe, and the author. House stills stay `/stills/{id}.png`. A guest look uses that look’s still. A human Slack paste is still #52. |
| 390px studio is usable | Pass | Header Atelier / Vote / Look and card Vote are 44px. Look never goes to `/look/preview`. |
| Would you text this URL to a fashion person? | Pass | The live studio is evening-wear. The leftover that would have stopped the forward was #39. |
| Tee reads as clothing from ~2 metres | Form Pass live | Clothing tee is on production after #107. Full pencil ceremony for #92 is still open. |
| Marks and type are objects | Local | Drag, scale, rotate on the panel. Tap the chest to place or move the word. Size chips, not hex. |
| 390px is one rail | Local | Fabric, paint, structure, layers, this house, and publish share one scroll. Draw \| Cloth stays. |
| The cut reads as clothing | Local | V, Crop, Long sleeve change the form. Ink and the word stay. |
| Sleeve is a panel | Local | Front / Back / Sleeve. A stripe can wrap both arms. |
| A painted house tee sits on the board | Local | Crop Silk sits with Midnight Silk. Recipe names the cut. Remix continues V / Crop / Long. |

## 90-second shot list

1. Open the studio. A white evening gown fills the frame. Fashion Leader Vote. No captured cursor.
2. Tap **Silk**. The cloth takes sheen. The title becomes Silk 01.
3. Switch to **Tee**. It reads as a T-shirt.
4. Tap **V**, **Crop**, **Long**. The form changes. Any ink already on it stays.
5. Drop a **Stripe**, type a word, draw. Switch **Sleeve**. The sheet is a garment, not a poster.
6. On the 3D cloth: tap the chest to place or move the same word. The sheet agrees.
7. Tap **Silk**. The print stays. Sheen still reads as silk.
8. **Enter the Vote**. **Crop Silk** already sits with Midnight Silk. Recipe: Tee · V · Crop · Long sleeve · Silk · Ink.
9. Remix that look. The cut continues. **This house** keeps mornings and looks you entered. Guest stays Guest.
10. Optional: **/soon** — three looks, the house leader first, then painted looks, then a plain join. Not six months free.

A second house-authored silhouette is not this season. Hoodie and overshirt failed the same 2m clothing test as the tank. Style3D stays cloth-only.

## Founder QA — L10

Would you stay in the room? Same bar as #60 / #92 / #106. Blocked by W19–W23 and an honest live #92 now that the clothing tee is on production. Do not close #117 from a local run.

## Cover note

Subject: https://3d-playground-vert.vercel.app/

This is Create / Publish / Vote as a URL.

You land on a gown, not a building. Cloth names, not sliders. Enter the vote and the board already looks like a house. One vote can name a Leader. The look link stands alone.

The garment is the foundation. The design is ink. 2D and 3D are the same look. The tee has a cut a tailor would name, a sleeve you can print, and a word you can move on the cloth.

I did not build CAD, pattern grading, cloth simulation, or AI. There is no login.

## Leftover risk

- #52 needs a human Slack or iMessage paste. Crawler meta is not that paste.
- The live board caps at 24 looks. Memory fallback still keeps the house looks locally and in tests.
- The look route loads Three (~270KB gzip).
- #54 closed. Campus path is gone.
- Hybrid atelier is #75. Founder QA for ink is #92. The house he can show is #96. Investor QA is #106. The print room is #108. Founder QA for the room is #117.
