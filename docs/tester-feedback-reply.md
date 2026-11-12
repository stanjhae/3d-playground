# Reply to the first external MVP test (12 Nov 2026)

A partner tested the alpha on a phone and on a desktop as a first-time user, and sent detailed feedback in eight areas. This file has a ready-to-send reply. It answers each point and says whether the behaviour is **intentional**, a **bug** (with the plan phase that fixes it) or **planned**.

**Notes for the owner before sending:**

- The phase numbers refer to the internal feedback plan: 1 editor blockers, 2 navigation, 3 save and publish, 4 editor clarity, 5 graphics library, 6 shape editing v1, 7 these documents. You may want to drop them from the message you send.
- Nothing here promises a date or anything `docs/claims-audit.md` doesn't allow. In particular there is **no live AI** anywhere in the product, and the reply doesn't say otherwise.
- We haven't seen the two videos the tester mentioned yet. Two answers (mobile overlap, landing demo) say what we found in the code and ask for the videos plus device and browser to confirm.

---

## The reply

Hi,

Thank you for testing so carefully, and for writing everything down. This is exactly the first-time-user view we can't get ourselves. None of the points read as too many: almost all of them are real, and several turned out to be bugs we hadn't caught. Below I go through them in your order and say for each one whether it's intentional, a bug or planned.

### 1. Mobile: elements overlapping the workspace

**Bug.** On a phone the editor stacks a header, a step bar, a step description, the tools and sometimes a floating hint card into one screen. On smaller phones they crowd out or cover the 3D view, and the publish panel can take up most of the screen.

We're fixing it with:
- a much more compact header and step bar on phones;
- step descriptions folded into one line you can expand;
- hints that sit in the tools area instead of over the garment;
- an automated test on a phone-sized screen that fails if anything covers the workspace on any step.

Could you send the video, plus your phone model and browser? Then we can check that we're fixing exactly what you saw. *(Phase 1a)*

### 2. Desktop: simplified T-shirt instead of the 3D model

**Bug, and a good catch.** The real 3D T-shirt is meant to show everywhere, and there's no deliberate desktop/mobile difference. What happened: a design started from the sketch pad on the landing page was brought into the studio on an older, simpler T-shirt model. Designs saved before the new model arrived also stay on the old one.

On desktop the landing's sketch pad loads automatically, so desktop visitors are much more likely to go through that path. That's why it looked like a desktop difference.

We're fixing it in two ways:
- designs from the landing page will open on the real 3D T-shirt;
- older designs will get a one-click "upgrade to the new 3D T-shirt" that keeps everything you placed on them. *(Phase 1b)*

### 3. Landing page and navigation

- **Live demo didn't work: bug, being investigated.** The landing page was rebuilt very recently. The current version has a sketch pad with a live 3D T-shirt next to it. On phones and tablets the 3D part only starts after you tap "Spin it in 3D". Until then you see a still picture, which can look like a broken demo. If the 3D view fails to load, the page currently falls back to that picture silently.

  We'll make the tap-to-start much clearer, record those failures so we can see them, and check against your video. *(Phase 1h)*
- **Demo less advanced than the real editor: intentional at first, now changing.** The landing used the lighter, older T-shirt model to keep the page fast. We'll switch it to the same real 3D T-shirt the editor uses, so what you see first matches what you get. *(Phase 1h)*
- **Showing which section you're viewing: planned.** The section links ("How it works" etc.) will highlight as you scroll. We also found that on tablet-sized screens the section links didn't show at all, and that's being fixed too. *(Phase 2)*
- **Active tab highlighting: bug.** Home and My Studio never showed as active. Every main tab will highlight the page you're on, like the steps in the editor do. *(Phase 2)*
- **Create vs My Studio: bug.** You were right: with sign-in on, "Create" quietly sent you to My Studio, so the two did the same thing. We're splitting them:
  - **Create** will open a "Start a design" page where you pick a garment or an example;
  - **My Studio** will be your library of saved designs. *(Phase 2)*

### 4. Design process and usability

- **Undo: bug (missing control).** Undo and redo exist, but in the drawing step they were only reachable with the keyboard, so on a phone they weren't reachable at all. There will be Undo and Redo buttons at the top of the editor on every step. *(Phase 1f)*
- **Selecting a graphic, then clicking the garment: bug (unclear behaviour).** Tapping a graphic adds it straight away to the middle of the side you're on. The next click on the garment then drew a brush line instead of placing anything, which is confusing. We're fixing it in three ways:
  - you'll see a clear "Added to Front — drag to move" message;
  - you'll be able to **drag graphics and images straight onto the garment**, in 2D and in 3D;
  - dropping on an area that can't be printed (seams, collar) will tell you so instead of doing nothing. *(Phase 1d)*
- **Deleting elements: bug (missing control).** Deleting was only possible with the keyboard or from the layers list. A selected element will get a small toolbar right next to it with Delete, Duplicate and Bring forward. *(Phase 1e)*
- **Resizing uploaded images after placing them: bug (hard to reach).** Resize and rotate handles existed only on the flat 2D view, which phones mostly don't show. We're adding:
  - tap an element on the 3D garment to select it, with size and rotation sliders always shown;
  - pinch to resize and twist to rotate on touch screens. *(Phase 1e)*
- **Drawing while rotating: bug, and an important one.** Any drag on the garment painted it, whichever tool was selected. From now on the garment only gets ink when the **Draw** tool is on. With every other tool, dragging the garment turns it. Inside Draw there will be a "rotate view" toggle, and two fingers always rotate on touch screens. Switching tools or steps leaves drawing mode. *(Phase 1c)*
- **Bigger design area: planned.**
  - Step descriptions and the step bar will get much smaller.
  - On desktop you'll be able to fold away the flat 2D panel so the 3D garment gets the full width. *(Phases 1a and 1g)*
- **Showing the real shape of each design surface: planned.** Today Front, Back and the sleeves are shown as plain rectangles. We'll draw each piece's actual outline and grey out what isn't printable. Each tab will get a small silhouette, and choosing a side will highlight that piece on the 3D garment. *(Phase 4)*
- **Pro Tools: intentional, but too subtle.** Pro Tools shows precision controls: exact position and size fields, brush opacity, custom colours, named checkpoints and version history. It doesn't change the process itself, so it's easy to miss. The switch will say what it unlocks and point to the new controls when you turn it on. *(Phase 4)*
- **"Coming soon" labels: planned.** Fits and options that aren't built yet will show as disabled with a "Coming soon" label. Also, the garment picker inside an existing design was silently ignored. It will now say that the garment is chosen when you start a new design. *(Phase 4)*

### 5. Saving, publishing and My Studio

- **Private saving vs publishing: bug (unclear).** Designs save automatically and privately as you work, but the only button was Publish, so the "private" text read like a contradiction. The last step will have two clear choices: **Save privately** and **Publish publicly**. The save status will also say "Saved privately". *(Phase 3)*
- **Publishing later from My Studio: planned.** Private designs in My Studio will get a "Publish…" action, and published ones an "Unpublish" action. *(Phase 3)*
- **Editing saved designs: intentional, but hard to find.** It already works: clicking a design's title in My Studio reopens it in the editor. That clearly isn't obvious, so each card will get an explicit **Edit** button, and the picture will open the design too. *(Phase 3)*

### 6. Voting, ranking and preview

- **Voting in the main navigation: bug.** The voting board exists, but it was hidden from the menu once sign-in became required. "Vote" will be in the main navigation. *(Phase 2)*
- **Rankings: planned.** Today you can vote on a design's page and see its count, but there's no ranking view yet. The voting page will get two tabs:
  - **Vote**, for discovering designs;
  - **Rankings**, with each design's place and vote count, filterable by garment.

  Your own published designs in My Studio will show their votes and rank. Every count comes from real accounts. *(Phase 2)*
- **Tall Male vs Tall Female: bug (too little difference).** The preview figure is a simple mannequin that only changed in height, chest and waist, so the presets looked almost the same. The garment also didn't adapt to the figure. We'll give each preset clearly different proportions (shoulders, bust, hips) and fit the garment to the figure. This stays a visual preview, not a sizing tool. *(Phase 4)*

### 7. Graphics, logos and design elements

- **Fashion Leader logo:** being looked into separately.
- **Why exactly these graphics: placeholders.** The flames, crosses and shapes were simple placeholder drawings, made to prove that placing, moving and layering graphics works. They were never meant as the final library, which is why they look rough on the new high-resolution T-shirt. There was also a technical reason they looked blurry, which we're fixing too.
- **Searchable graphics library: planned.** We're building a curated, searchable library:
  - many more detailed, high-quality vector graphics;
  - categories (flames, crosses, symbols, patterns, florals, ornaments, shapes) and tags;
  - a search box, so you can type "flames" or "cross" and filter.

  We're keeping it curated rather than pulling from the open internet. That way every graphic is cleared for use, looks good on a garment and stays sharp. And yes, adding more graphics doesn't change the workflow at all. *(Phase 5)*
- **Your own artwork** still works alongside the library: you can upload your own PNG or JPEG images.

### 8. The bigger question: 2D-to-3D garment creation

You're right that the MVP follows your **Workflow 2** today: pick an existing 3D garment, then customise how it looks with colours, patterns, drawings, words, graphics and images.

**Workflow 1** is still part of the vision: changing the garment's actual **shape, cut and proportions** in 2D and seeing the 3D garment follow. It's what separates us from simple customisers, so here's an honest view of how we get there.

**Is it technically realistic?** Yes, in stages. It's a much bigger build than Workflow 2, but none of it is out of reach. We see three levels:

1. **Shape controls on our existing garments (next step).** Adjust the real 3D T-shirt directly:
   - each sleeve's length on its own, so one sleeve can be longer than the other;
   - body length and cropping;
   - width, from fitted to boxy;
   - neckline depth.

   Your prints and drawings stay attached as the shape changes. This is a contained addition to the current editor, and we're starting on it now. *(Phase 6)*
2. **Editing the garment's pattern in 2D.** This is how real garments are made. The garment is described as flat 2D pattern pieces (front, back, sleeves) sewn together. Change a piece's outline in 2D, for an asymmetric cut, a new neckline or a different silhouette, and the 3D garment is rebuilt from the pieces by simulating the fabric.

   This is the full version of Workflow 1, including drawing new outlines. It needs a new core (a pattern editor and fabric simulation), so it's a larger, later stage. Our editor already treats the flat 2D design as the source of truth, which is the right foundation for it.
3. **AI-assisted creation.** AI can now turn a picture into a 3D shape that *looks* convincing. But that shape isn't a garment: it has no pattern pieces, seams or printable surfaces, so it can't be edited, printed on or made. Where AI could really help is *interpreting* your drawing: for example, suggesting shape settings (level 1) or a starting pattern (level 2), which you then refine yourself.

   We see AI as a helper on top of levels 1 and 2, not a replacement for them. To be clear, there's no AI in the product today, and we won't claim any until it really works.

**How complex is it compared to today?**
- Level 1 is a feature: weeks of work within the current architecture.
- Level 2 is a new part of the product: months, with research on making fabric simulation run well in a browser.
- Level 3 depends on outside AI technology that is moving fast. It makes the most sense once level 2 exists, so the AI has something real and editable to produce.

**Is it planned, or a different architecture?**
- Level 1 is planned and starts now.
- Level 2 extends the current architecture: today the flat 2D design describes what's *printed* on a fixed garment, and it would also describe the garment's *pieces*.
- Level 3 would be built on top of level 2.

**How do we grow creative freedom without overcomplicating the MVP?** One layer at a time, each one optional:
1. Make customisation (Workflow 2) solid and easy. That's most of this feedback.
2. Give it a much richer graphics library.
3. Add simple shape sliders on the real garment.
4. Then pattern editing for people who want to go further.

A beginner never has to touch the advanced layers, and an ambitious designer can keep going.

I've written a more detailed technical comparison of the three levels if you want to go deeper. Happy to walk through it together.

Thank you again. This was incredibly useful, and it's the reason the first wider testers will get a much better product. I'll send an update as the fixes land.

Best,
Chijindu

---

## Status summary

| # | Point | Status | Phase |
| --- | --- | --- | --- |
| 1 | Mobile elements overlapping the workspace | Bug | 1a |
| 2 | Desktop shows the simplified tee | Bug | 1b |
| 3 | Landing live demo not working | Bug (to confirm with video) | 1h |
| 3 | Landing demo less advanced than the editor | Intentional (speed), changing | 1h |
| 3 | Which section is in view | Planned | 2 |
| 3 | Active nav tab highlight | Bug | 2 |
| 3 | Create vs My Studio the same | Bug | 2 |
| 4 | Undo button | Bug (missing control) | 1f |
| 4 | Graphic, then click the garment | Bug (unclear behaviour) | 1d |
| 4 | Deleting elements | Bug (missing control) | 1e |
| 4 | Resizing uploaded images | Bug (hard to reach) | 1e |
| 4 | Painting while rotating | Bug | 1c |
| 4 | Bigger design area | Planned | 1a, 1g |
| 4 | Real shape of each surface | Planned | 4 |
| 4 | Pro Tools difference | Intentional, too subtle | 4 |
| 4 | Coming soon labels | Planned | 4 |
| 5 | Save privately vs publish | Bug (unclear) | 3 |
| 5 | Publish later | Planned | 3 |
| 5 | Edit saved designs | Intentional, hard to find | 3 |
| 6 | Voting in the main nav | Bug | 2 |
| 6 | Rankings | Planned | 2 |
| 6 | Tall Male vs Tall Female | Bug (too little difference) | 4 |
| 7 | Fashion Leader logo | Being looked into | — |
| 7 | Why these graphics | Placeholders | 5 |
| 7 | Searchable library, more detail | Planned | 5 |
| 8 | Shape editing (Workflow 1) | Planned, staged | 6, then later (see `docs/research/2d-to-3d.md`) |
