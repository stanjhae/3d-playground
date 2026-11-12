# Reply to the first external MVP test (12 Nov 2026)

A partner tested the alpha on a phone and on a desktop as a first-time user, and sent detailed feedback in eight areas. This file has a ready-to-send reply. It answers each point and says whether the behaviour is **intentional**, a **bug** (with the plan phase that fixes it) or **planned**.

**Notes for the owner before sending:**

- The phase numbers refer to the internal feedback plan: 1 editor blockers, 2 navigation, 3 save and publish, 4 editor clarity, 5 graphics library, 6 shape editing v1, 7 these documents. You may want to drop them from the message you send.
- Nothing here promises a date or anything `docs/claims-audit.md` doesn't allow. In particular there is **no live AI** anywhere in the product, and the reply doesn't say otherwise.
- We haven't seen the two videos the tester mentioned yet. Two answers (mobile overlap, landing demo) say what we found and fixed, and ask for the videos plus device and browser to confirm.
- Phases 1–4 are built (PR #372), and so are the graphics library (phase 5) and shape editing v1 (phase 6), each in its own PR. Send this once they're live, or soften "fixed" to "fixed, going live soon".

---

## The reply

Hi,

Thank you for testing so carefully, and for writing everything down. This is exactly the first-time-user view we can't get ourselves. None of the points read as too many: almost all of them are real, and several turned out to be bugs we hadn't caught. Most are already fixed. Below I go through them in your order and say for each one whether it was intentional, a bug or planned, and what changed.

### 1. Mobile: elements overlapping the workspace

**Bug, fixed.** On a phone the editor stacked a header, a step bar, a step description and the tools into one screen, and the publish panel could take up most of it. We also found that the browser could scroll the whole editor sideways out from under its own header, which left the tools sitting over the garment.

What changed:
- a compact step bar, with Undo/Redo on the same row as Back and Continue;
- step descriptions folded into one line you can expand;
- the publish panel capped at half the screen;
- the editor frame can no longer be scrolled out of place.

On a standard phone the 3D view is about a third taller than before. Could you send the video, plus your phone model and browser? Then we can check that this covers exactly what you saw. *(Phase 1a)*

### 2. Desktop: simplified T-shirt instead of the 3D model

**Bug, and a good catch. Fixed.** The real 3D T-shirt is meant to show everywhere, and there's no deliberate desktop/mobile difference. What happened: a design started from the sketch pad on the landing page was brought into the studio on an older, simpler T-shirt model. Designs saved before the new model arrived also stay on the old one.

On desktop the landing's sketch pad loads automatically, so desktop visitors are much more likely to go through that path. That's why it looked like a desktop difference.

What changed:
- designs from the landing page now open on the real 3D T-shirt;
- older designs show a one-click "Use the new 3D T-shirt" that keeps everything you placed on them (sizes can shift a little, and Undo takes it back). *(Phase 1b)*

### 3. Landing page and navigation

- **Live demo didn't work: bug, improved, to confirm with your video.** The landing page was rebuilt very recently. It has a sketch pad with a live 3D T-shirt next to it. On phones and tablets the 3D part only starts after you tap "Spin it in 3D", and until then you see a still picture, which can look like a broken demo. That button is now much more prominent. If the 3D view fails, the page now says so instead of silently showing the picture, and the failure is logged so we can see it. *(Phase 1h)*
- **Demo less advanced than the real editor: was intentional, now changed.** The landing used the lighter, older T-shirt model to keep the page fast. It now shows the same real 3D T-shirt the editor uses, and its Front/Back/Left/Right buttons turn that model. *(Phase 1h)*
- **Showing which section you're viewing: done.** The section links ("How it works" etc.) now highlight as you scroll. We also found that on tablet-sized screens the section links didn't show at all; that's fixed too. *(Phase 2)*
- **Active tab highlighting: fixed.** Every main tab now highlights the page you're on, like the steps in the editor do. *(Phase 2)*
- **Create vs My Studio: fixed.** You were right: with sign-in on, "Create" quietly sent you to My Studio, so the two did the same thing. Now:
  - **Create** opens a "Start a new design" page where you pick a garment or an example;
  - **My Studio** is your library of saved designs. *(Phase 2)*

### 4. Design process and usability

- **Undo: bug (missing control), fixed.** Undo and redo existed, but in the drawing step only on the keyboard, so on a phone not at all. There are now Undo and Redo buttons in the editor on every step and screen size. *(Phase 1f)*
- **Selecting a graphic, then clicking the garment: bug (unclear behaviour), fixed.** Tapping a graphic adds it straight away to the middle of the side you're on, and the next click on the garment used to draw a brush line instead, which was confusing. Now:
  - you see a clear "added to the front, drag it on the garment to move it" message;
  - you can **drag graphics straight onto the garment**, onto the flat sides or the 3D model;
  - dropping somewhere that can't be printed (around the garment, the collar) says so instead of doing nothing. *(Phase 1d)*
- **Deleting elements: bug (missing control), fixed.** Deleting was only possible with the keyboard or from the layers list. The selected element's panel now starts with **Remove** and **Duplicate**, and it scrolls into view when you select something. *(Phase 1e)*
- **Resizing uploaded images after placing them: bug (hard to reach), fixed.** Resize and rotate handles existed only on the flat 2D view, which phones mostly don't show. Now tapping an element on the 3D garment selects it, and its size and rotation sliders are always shown, with or without Pro Tools. Pinch-to-resize on touch screens is next. *(Phase 1e)*
- **Drawing while rotating: bug, and an important one. Fixed.** Any drag on the garment painted it, whichever tool was selected. Now the garment only gets ink when the **Draw** tool is on; with every other tool, dragging turns it. Inside Draw there's a **Rotate view** button, and switching tools or steps leaves it. *(Phase 1c)*
- **Bigger design area: done.**
  - Step descriptions and the step bar are much smaller on phones.
  - On desktop you can fold away the flat sides ("Hide flat sides") so the 3D garment gets the full width. *(Phases 1a and 1g)*
- **Showing the real shape of each design surface: done.** Front, Back and the sleeves used to be plain rectangles. Each now shows the piece's actual shape, with everything that falls off the garment shaded, so you can see where a design will and won't print. *(Phase 4)*
- **Pro Tools: intentional, but too subtle. Clearer now.** Pro Tools shows precision controls: brush colour, size and opacity, exact size, angle and position numbers, copy to the opposite side, and named checkpoints and versions. It doesn't change the process itself, so it was easy to miss. The switch now says what it adds, briefly, each time you turn it on. *(Phase 4)*
- **"Coming soon" labels: done.** Fits that aren't built yet show as disabled with a "Coming soon" label. The garment picker inside an existing design, which was silently ignored, now says a design keeps its garment and links to starting a new one. *(Phase 4)*

### 5. Saving, publishing and My Studio

- **Private saving vs publishing: bug (unclear), fixed.** Designs save automatically and privately as you work, but the only button was Publish, so the "private" text read like a contradiction. The last step now has two clear choices, **Save privately** and **Publish publicly**, and the save status says "Saved privately". *(Phase 3)*
- **Publishing later from My Studio: done.** Private designs in My Studio have a **Publish…** button, and published ones an **Unpublish** button. *(Phase 3)*
- **Editing saved designs: intentional, but hard to find. Clearer now.** It already worked by clicking a design's title, which clearly wasn't obvious. Each card now has an **Edit** button, and the picture opens the design too. *(Phase 3)*

### 6. Voting, ranking and preview

- **Voting in the main navigation: bug, fixed.** The voting board existed, but it was hidden from the menu once sign-in became required. **Vote** is now in the main navigation. *(Phase 2)*
- **Rankings: done.** The voting page, now "Vote and rankings", has two tabs:
  - **Rankings**, with each design's place and vote count, filterable by garment;
  - **New**, the newest designs, for discovering and voting.

  Your own published designs in My Studio show their rank and votes. Every count comes from real accounts. *(Phase 2)*
- **Tall Male vs Tall Female: bug (too little difference), fixed.** The preview figure only changed in height, chest and waist, so the presets looked almost the same, and the real T-shirt didn't sit on it properly. There are now separate **Tall · Male** and **Tall · Female** models, every model is labelled, male and female figures have different shoulders, bust and hips, and the T-shirt sits on each one at its size. This stays a visual preview, not a sizing tool. *(Phase 4)*

### 7. Graphics, logos and design elements

- **Fashion Leader logo:** being looked into separately.
- **Why exactly these graphics: placeholders.** The flames, crosses and shapes were simple placeholder drawings, made to prove that placing, moving and layering graphics works. They were never meant as the final library, which is why they look rough on the new high-resolution T-shirt. There was also a technical reason they looked blurry, which is fixed.
- **Searchable graphics library: built.** There's now a curated, searchable library:
  - 97 detailed vector graphics, drawn for us and cleared for use, replacing the placeholders;
  - categories (flames, crosses, symbols, patterns, florals, ornaments, shapes) and tags;
  - a search box, so you can type "flames" or "cross" and filter;
  - graphics stay sharp on the high-resolution T-shirt.

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

   Your prints and drawings stay attached as the shape changes. This is a contained addition to the current editor, and a first version is built. *(Phase 6)*
2. **Editing the garment's pattern in 2D.** This is how real garments are made. The garment is described as flat 2D pattern pieces (front, back, sleeves) sewn together. Change a piece's outline in 2D, for an asymmetric cut, a new neckline or a different silhouette, and the 3D garment is rebuilt from the pieces by simulating the fabric.

   This is the full version of Workflow 1, including drawing new outlines. It needs a new core (a pattern editor and fabric simulation), so it's a larger, later stage. Our editor already treats the flat 2D design as the source of truth, which is the right foundation for it.
3. **AI-assisted creation.** AI can now turn a picture into a 3D shape that *looks* convincing. But that shape isn't a garment: it has no pattern pieces, seams or printable surfaces, so it can't be edited, printed on or made. Where AI could really help is *interpreting* your drawing: for example, suggesting shape settings (level 1) or a starting pattern (level 2), which you then refine yourself.

   We see AI as a helper on top of levels 1 and 2, not a replacement for them. To be clear, there's no AI in the product today, and we won't claim any until it really works.

**How complex is it compared to today?**
- Level 1 is a feature: weeks of work within the current architecture.
- Level 2 is a new part of the product: months, with research on making fabric simulation run well in a browser.
- Level 3 depends on outside AI technology that is moving fast. It makes the most sense once level 2 exists, so the AI has something real and editable to produce.

**Is it planned, or a different architecture?**
- Level 1 has a first version built.
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

| # | Point | Status | Where |
| --- | --- | --- | --- |
| 1 | Mobile elements overlapping the workspace | Fixed (to confirm with video) | PR #372, 1a |
| 2 | Desktop shows the simplified tee | Fixed | PR #372, 1b |
| 3 | Landing live demo not working | Improved (to confirm with video) | PR #372, 1h |
| 3 | Landing demo less advanced than the editor | Changed: real tee | PR #372, 1h |
| 3 | Which section is in view | Done | PR #372, 2 |
| 3 | Active nav tab highlight | Fixed | PR #372, 2 |
| 3 | Create vs My Studio the same | Fixed | PR #372, 2 |
| 4 | Undo button | Fixed | PR #372, 1f |
| 4 | Graphic, then click the garment | Fixed (drag onto the garment) | PR #372, 1d |
| 4 | Deleting elements | Fixed (Remove in the selected-item panel) | PR #372, 1e |
| 4 | Resizing uploaded images | Fixed (sliders on select); pinch next | PR #372, 1e |
| 4 | Painting while rotating | Fixed (ink only with Draw, Rotate view) | PR #372, 1c |
| 4 | Bigger design area | Done | PR #372, 1a, 1g |
| 4 | Real shape of each surface | Done (shaded off-garment areas) | PR #372, 4 |
| 4 | Pro Tools difference | Explained in the switch | PR #372, 4 |
| 4 | Coming soon labels | Done | PR #372, 4 |
| 5 | Save privately vs publish | Fixed | PR #372, 3 |
| 5 | Publish later | Done | PR #372, 3 |
| 5 | Edit saved designs | Edit button added | PR #372, 3 |
| 6 | Voting in the main nav | Fixed | PR #372, 2 |
| 6 | Rankings | Done | PR #372, 2 |
| 6 | Tall Male vs Tall Female | Fixed | PR #372, 4 |
| 7 | Fashion Leader logo | Being looked into | — |
| 7 | Why these graphics | Placeholders, replaced | Graphics PR, 5 |
| 7 | Searchable library, more detail | Built | Graphics PR, 5 |
| 8 | Shape editing (Workflow 1) | Level 1 built; later levels staged | Shape PR, 6; see `docs/research/2d-to-3d.md` |

**Not built yet** (from the plan, worth a follow-up): pinch-to-resize and twist-to-rotate on the 3D garment, two-finger rotate while drawing, a small toolbar beside the selected element, hint cards docked into the tools on phones, an automated "nothing covers the workspace" phone test, silhouettes on the side tabs and highlighting the chosen side on the 3D garment.
