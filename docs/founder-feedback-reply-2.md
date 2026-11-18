# Reply to the founder's later feedback (rounds 2–5, 14–17 Nov 2026)

The first review (12 Nov) is answered in [tester-feedback-reply.md](tester-feedback-reply.md). After it, the founder sent four more messages:
- **Round 2:** a second test of the beta (8 points).
- **Round 3:** an agenda for the call (rankings, garments and materials, AI and 2D-to-3D).
- **Round 4:** a note on marketing and priorities (mockup videos, the pitch deck).
- **Round 5:** a post-call list (7 points), plus a request for the call transcript.

This file has a ready-to-send reply covering all four. It's in the same style as the first: each point is **fixed**, **built**, **intentional** or **for us to decide**.

**Notes before sending:**

- **Live on beta:** everything below is merged into master, which deploys to beta. The PR numbers are for us, so drop them from the message if you like.
- **Your parts:** two things are yours to fill in before sending. They're marked **[you]**: the call transcript and the video concepts.
- **What's not claimed:** nothing promises a date, or anything `docs/claims-audit.md` doesn't allow. There is still **no live AI** on the site. The AI suggestion is built, but it's off and has no API key.
- **Re-checking on beta:** after these merges, re-check on beta with screenshots before sending. The landing on a phone, the right sleeve and the try-on are the ones the founder will try first.

---

## The reply

Hi,

Thank you for the second round of testing, the call, and the follow-up list. Below I go through everything you sent since my last reply, in order. Short version: every bug you found is fixed and live on beta, and so are the features we agreed on the call. While fixing the sleeves we also found and fixed a bigger problem you hadn't seen yet (point 1).

### Round 2: your second test of the beta

1. **Right sleeve not fully covered: bug, fixed, and it was worse than it looked.**
   - **The cause:** the 3D T-shirt's sleeves were mapped with a method that misjudged the direction of a short sleeve. The folds under the arm were treated as the inside of the sleeve, so they never got any print. The right sleeve lost about twice as much as the left: around 9% of it stayed bare.
   - **What we also found:** the same error ran the sleeve print from the shoulder *down*, so a word written upright on a flat sleeve showed **upside down and mirrored** on the 3D sleeve.
   - **The fix:** a new version of the T-shirt prints **100% of both sleeves**, the two sleeves are exact mirror images, and prints read the right way up.
   - **Older designs:** they get a one-click upgrade that moves sleeve marks to where they sat on the cloth. Undo takes it back.
2. **The 3D model turning to the side you're working on: half-built before, done now.**
   - **What already worked:** picking Back or a sleeve, or starting to draw on it, did turn the 3D T-shirt to that side.
   - **The problem:** if you then turned the T-shirt by hand, it sprang back as soon as you let go.
   - **Now:** a hand turn or a zoom stays where you put it, and picking a side again turns it back. When you turn away from a sleeve, the view settles back on the middle of the garment.
   - **Also fixed:** on phones, turning the T-shirt with two fingers while drawing used to leave a stray line. It doesn't any more.
   - **Phones:** the view buttons (Front, 3/4, Back, sleeves, Orbit) now also show on the Design step on phones.
3. **Flat templates looking uneven: improved.** The flat shapes are traced from the real 3D garment, which is why they followed its folds.
   - Front and back are now mirrored and smoothed.
   - The two sleeves share one smooth outline, mirrored.
   - They're still the garment's true shape, not idealised drawings, because they show exactly where a print will land.
4. **Highlighting the section you're viewing: fixed on tablets.**
   - It worked on desktop, but on tablet-sized screens the section links were hidden in the menu.
   - They now show with the red underline from tablet width up, and the phone menu underlines the current section too.
5. **Drawing on the Back in the landing demo: fixed, and now proven by tests.** Automated tests now draw on the Back and on each sleeve, then read the 3D picture to check the ink appears on that side and not the opposite one. If you still see a problem, please send the video and your browser.
6. **Left and Right sleeve swapped on the landing: fixed, and the cause was naming.**
   - **The naming rule:** sleeves are named as *worn*. When you face the T-shirt from the front, the wearer's **right** sleeve is on **your left**, like a person facing you. The studio already worked this way, but the landing just said "Left" and "Right", which reads as the viewer's side.
   - **Now:** the landing uses the studio's names and order: Front, Back, Right sleeve, Left sleeve. A test keeps the two the same.
7. **Starting fresh vs continuing the landing design: thank you.** We also added "Start fresh instead", for when you've drawn on the landing but want a blank design.
8. **"Drop a graphic" on the landing: fixed, and made obvious.**
   - You can drag a graphic onto the 3D T-shirt or onto the drawing pad, with a mouse or a finger, and it lands exactly where you let go.
   - While you drag, a dashed outline shows where you can drop, and the instruction "Drag onto the tee or the pad" is visible text, not only a tooltip.
   - If you turned the T-shirt by hand, it lands on the side you're looking at.

### The call agenda

**Voting and ranking: built (more in post-call point 4).**
- **Vote** and **Ranking** are separate sections in the main menu.
- Every vote is one vote per account. Votes on your own designs, and votes from accounts less than a day old, don't count towards ranking.
- **Ranking** sorts published designs by counted votes. You can switch period (this week, this month, all time) and filter by garment.
- **Vote** reads the same counts, so the two always agree.

**More garments, shapes and materials: a first round is built.**
- **Garments:** 13 garments to choose from, including:
  - T-shirt, hoodie, vest and crop top;
  - dress, slip and overall dress;
  - coat, suit and tailored suit;
  - trousers and a shirt-and-skirt outfit.

  The jacket and some accessories show as "Coming soon". The T-shirt is still the most complete: print on all four sides, plus shape sliders for each sleeve's length, body length, width and neckline.
- **Materials:** 10 fabrics (for example cotton, denim, leather, satin, wool, linen and chiffon), chosen on the Colour step for any garment and shown in the 3D view. More in post-call point 5.
- **Priorities:** we'd suggest adding depth (more print areas on the new garments, more fabrics) based on what testers actually pick, rather than adding many more garments now.

**AI and the 2D-to-3D workflow: here's where it stands.** I've updated the technical note with the effort, cost and build-or-buy figures you asked for. Here's the summary:
- **Shape sliders (your Workflow 1, first level): live on the T-shirt.** One sleeve can be longer than the other, and you can crop, widen, or deepen the neckline. Prints follow the shape.
- **Pattern editing (the full Workflow 1): built as an opt-in beta, "Pattern (beta)".**
  - The garment becomes flat pattern pieces you can reshape and cut holes into, and the 3D garment is rebuilt by simulating the fabric in the browser.
  - It works on all garments, and the fabric choice changes how it drapes.
  - It's a beta because it still needs testing on real phones and real tester feedback.
  - **It's switched on for everyone on beta now:** turn on "Pattern (beta)" on the Garment step of any design. Your normal designs aren't affected unless you switch it on.
- **AI: built, but switched off.**
  - It turns a sketch or a short description into suggested pattern changes. You see the suggestion and choose whether to apply it.
  - It never invents a garment from nothing. Its output is always a normal, editable pattern.
  - We'd only turn it on once Pattern (beta) has been tried by testers.
  - Each suggestion costs a few cents in AI fees, and it's capped per account per day.
  - It never appears in any claim on the site until it really works.
- **Build or buy:** we recommend **building on what we have**, not licensing professional tools such as CLO3D, Browzwear or Marvelous Designer. Those are desktop apps for fashion professionals, licensed per seat, and not made to run inside a consumer website. Using any of them for this would mean a commercial agreement with that vendor, which we'd need to look into. AI image-to-3D tools make shapes that look right but can't be edited, printed on or made, so we use AI only as an assistant.
- **The path:** validate what testers do with the current editor first. Open Pattern (beta) to a small group, then decide on AI from what they do with it. That keeps the MVP simple for beginners, and every advanced layer stays optional.

### Videos and priorities

- **Mockup videos:** agreed, these are the best next step for validation reach. We can record them from the real studio, so they show the product truthfully. **[you: which of the concepts you sent to start with, and the order.]**
- **Pitch deck:** noted as lower priority. Happy to update it once the videos are moving.

### After the call: your 7 points

1. **Landing demo: fixed.**
   - **Logos:** you can now select, move, resize and remove them at any time, on a computer and on a phone (tap to select, long-press to move).
   - **Drawing:** it works across the whole side, including hem, shoulders and sleeves.
   - **Drag to turn:** it works again with a mouse, and now also with a finger.
2. **Design process, 2D and 3D: fixed.**
   - **Gaps between sections:** the T-shirt now prints all the way round the sides and both sleeves, with no seam lines.
   - **Drag and drop:** it now works reliably on the flat sides and the 3D garment, between sides, by mouse and finger, and Undo during a drag works.
   - **Resizing:** you can pinch to resize and twist to rotate a placed element on the flat sides as well as in 3D.
   - **FLV mark:** redrawn as a clean vector everywhere, including the browser tab icon.
3. **Patterns and editing: built.**
   - **Fill a whole side:** one click fills a whole side (Front, Back or a sleeve) with a pattern or graphic, or every side at once. Tile size and rotation are adjustable.
   - **Stretch one side:** drag the handle on one edge, or type an exact width and height, to stretch an element in one direction only. Dragging a corner still scales evenly.
   - **Layers:** a Layers panel for everyone, not just Pro, where you can hide and show, lock, reorder, rename and duplicate every element.
4. **Vote and Ranking separated: built.**
   - **Vote** is a discovery feed that shows designs needing votes first, newest first, and never shows your own designs. A new design always gets seen, even next to popular ones.
   - **Ranking** is the leaderboard.
5. **Fabrics: built.** 10 fabrics, each shown in 3D with its own sheen, texture and weight. In Pattern (beta), the fabric also changes how the garment drapes.
6. **Garment fit on the preview figure: improved.**
   - The T-shirt now sits on each figure with no part of the body showing through.
   - It eases over chest, bust and hips per figure, while the collar and shoulder seams stay in place.
   - It's still a visual preview, not a sizing tool.
7. **"Coming soon" labels: done.** Garments that aren't available yet show a "Coming soon" badge. On a saved design, other garments explain that a design keeps its garment and offer to start a new one.

**Call transcript:** **[you: attach it, or say when you'll send it.]**

Everything above is live on beta. Do try it again on your phone, especially the landing demo and the sleeves.

Best,
Chijindu

---

## Status summary

| Round | Point | Status | PR |
| --- | --- | --- | --- |
| 2 | Right sleeve coverage | Fixed: 100% both sleeves, mirrored; upside-down sleeve prints also fixed | #407 |
| 2 | 3D view follows the side you pick | Hand turns and zoom stay; view buttons on phones; no ink from a two-finger turn | #406, #410 |
| 2 | Flat templates uneven | Mirrored, smoothed outlines | #403, #407 |
| 2 | Active section underline | Fixed on tablets | #409 |
| 2 | Landing Back drawing | Fixed; checked on the 3D picture | #385, #409 |
| 2 | Landing Left/Right swapped | Named as worn, as in the studio | #385, #409 |
| 2 | Start new vs continue | Built; "Start fresh instead" added | #409 |
| 2 | Drop a graphic on the landing | Lands where dropped; outline and visible hint; touch | #399, #409 |
| 3 | Rankings | Built: periods, garment filter | #389, #401 |
| 3 | Garments and materials | 13 garments, 10 fabrics in 3D | #388, #394–#396, #402 |
| 3 | AI and 2D-to-3D | Shape sliders live; Pattern (beta) on for everyone on beta (18 Nov); AI built but off | #378–#384, `docs/research/2d-to-3d.md` |
| 4 | Mockup videos, pitch | For us to decide | — |
| 5 | Landing logos, drawing, turning | Fixed, on touch too | #399, #409 |
| 5 | 2D/3D gaps, drag and drop, FLV mark | Fixed | #397, #400, #403, #407, #408 |
| 5 | Pattern fill, one-side stretch, layers | Built | #401–#403 |
| 5 | Separate Vote and Ranking | Built | #401 |
| 5 | Fabrics | Built | #402 |
| 5 | Try-on fit | Improved: no body showing through | #397, #408 |
| 5 | Coming soon labels | Done | #397 |
| 5 | Call transcript | For you | — |
