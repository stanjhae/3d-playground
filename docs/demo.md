# Demo runbook — 17 Nov (#201)

The hosted Supabase project isn't ready, so the demo runs on one laptop:
local Supabase, the production build served by `pnpm preview`, and
Mailpit for the sign-in code. A recorded fallback covers the case where
something breaks and stays broken.

Demo account: `demo@example.test` (public name "Demo Studio"). There is no
password; you sign in with a code from Mailpit.

## Pre-flight (do this 30 minutes before)

Run everything from the repo root of the **main checkout**, the one that
runs `supabase start`. Never run `supabase stop`, `supabase db reset` or
`supabase reset` on demo day: they wipe the local database.

1. **Docker is running.** `docker info` prints server details, not an error.
2. **Supabase is up.**

   ```bash
   supabase status
   ```

   If it isn't running:

   ```bash
   supabase start
   ```

   `.env.local` must have `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` from
   `supabase status` (see `.env.example`). Leave `VITE_FLP_REQUIRE_AUTH` unset.
3. **Build and serve the production build** (keep this terminal open):

   ```bash
   pnpm build && pnpm preview --port 4173
   ```

4. **Reset the demo account** (in a second terminal, takes about 30 s):

   ```bash
   node scripts/demo-reset.mjs
   ```

   It deletes `demo@example.test` and everything it owns, recreates it and
   seeds three designs through the real API:

   | Design | State |
   | --- | --- |
   | Studio draft | Private. History: v1, v2 autosave, v3 checkpoint "First pass", v4 autosave, v5 restore of v3. |
   | Crest upload | Private. An uploaded PNG crest on the front. |
   | Night Market | Published: the studio itself rendered the three views in headless Chromium. |

   It prints the share link for Night Market. Running it again gives the
   same state with a new link (the old link stops working). Rerun it after
   every rehearsal; it also clears the account's rate-limit counters.
5. **Smoke check** (2 minutes):
   - open the printed share link: "Night Market", three views, "By Demo Studio";
   - open <http://127.0.0.1:54324> (Mailpit) in a tab and leave it open;
   - open <http://localhost:4173/> and check the landing shows the 3D tee.
6. **Fallback video ready.** `demo-fallback.webm` in the repo root opens and
   plays (see [Recording the fallback](#recording-the-fallback)). Have it open
   in a player, paused at the start, in another window.
7. Laptop: power plugged in, notifications off, browser zoom 100%, window at
   least 1440×900 so the editor's right column fits without scrolling.
   Close other tabs that use WebGL.

## The 5-minute script

Use a normal browser window for the studio and a private window for the
share link.

1. **Sign in (0:00–0:45).** Open <http://localhost:4173/sign-in>, enter
   `demo@example.test`, press **Email me a code**. Switch to the Mailpit tab,
   open the newest message to `demo@example.test`, copy the six digits, paste
   them into **6-digit code**, press **Sign in**.
   *Say:* "No passwords. A one-time code, and a new account is made on first
   sign-in."
2. **My Studio (0:45–1:00).** You land on My Studio with three designs:
   Studio draft, Crest upload, Night Market. *Say:* "Private by default.
   Everything here is saved to my account."
3. **Open the draft (1:00–1:15).** Click **Studio draft**. The editor opens
   with the four panels on the left (Front, Back, Wearer's right, Wearer's
   left) and the 3D tee in the middle.
4. **Edit all sides (1:15–2:15).**
   - Draw a stroke across the **Front** panel; the 3D tee updates live.
   - In the right column, type a word in the **Type** box, press **Type**,
     then click the **Back** panel to place it.
   - Press **Brush** and draw a mark on **Wearer's right** (a sleeve).
   - Watch the status next to the title: "Unsaved changes" turns into
     **Saved to cloud** within a few seconds.
   *Say:* "Front, back, both sleeves. It autosaves to the cloud."
5. **History (2:15–3:15).** Scroll the right column to **History** and press
   **Show**. Point at the seeded versions, including "First pass" and the
   earlier restore.
   - Press **Save checkpoint**, name it "Live demo", press **Save**.
   - On **v3 · First pass** press **Restore**, then **Restore** in the
     confirmation. The edits from step 4 disappear; a new "Restore · From v3"
     version is on top and the status returns to **Saved to cloud**.
   *Say:* "Nothing is lost: restoring adds a version, it never deletes one."
6. **Publish (3:15–4:00).** Scroll to the top and click step **6 Publish**.
   Press **Publish…**, check the public name "Demo Studio", press **Confirm
   publish**. It renders front, three-quarter and back (about 10–20 s), then
   shows "Published v… " and the link.
   *Say:* "Publishing takes a picture of exactly this saved version."
7. **Open the link (4:00–4:30).** Press **Copy link**, paste it into a
   private window. Signed out, you see the title, "By Demo Studio" and the
   three views, and nothing else: no history, no email.
8. **Unpublish (4:30–5:00).** Back in the studio press **Unpublish**. Reload
   the private window: **This design is not available**.
   *Say:* "Unpublish is instant. Nothing is cached."

If there is time, open **Crest upload** to show an uploaded image, or the
Night Market link printed by the reset as a second, already-published look.

## When something fails mid-demo

Stay calm, say what the app is telling you (it is designed to explain
itself), and fall back to the video if it isn't back in about 30 seconds.

| Symptom | What to do | What to say |
| --- | --- | --- |
| **"3D preview paused"** over the tee (the GPU dropped WebGL) | Keep drawing on the 2D panels; it saves. The preview usually returns by itself within seconds. If not, reload the page: the design comes back from the cloud. Close other WebGL tabs. | "The graphics card paused the 3D view. Your work still saves; it comes back on its own." |
| **"Publishing needs the 3D preview…"** under Publish | Normal for a second or two after opening step 6 while the preview starts. If it stays, the 3D preview is paused: reload, wait for the tee, publish again. | "Publishing photographs the 3D view, so it waits for it." |
| **"Saving paused, retrying"** | Wait; it retries by itself (a rate limit). Avoid rapid repeated edits. If it doesn't clear in 30 s, press **Save now**. Rerunning `demo-reset` before the demo resets the limits. | "It saw a burst of saves and is pacing itself. The work is kept on this device until it lands." |
| **"Offline — not saved"** or **"Save failed"** | Check the preview terminal is still running and `supabase status` is healthy. The edits stay on this device and save when the server is back. | "It keeps the work locally and saves when the connection is back." |
| **No sign-in code in Mailpit** | Wait 10 s and refresh Mailpit; search `to:demo@example.test`. A new code can only be sent after 60 s (**Send a new code in …s**). Make sure you used the newest code. Codes expire after 10 minutes. | "The code usually takes a second; locally it goes to a test inbox." |
| **Code rejected** | You pasted an older code. Request a new one after the 60 s timer, use the newest message. | — |
| **Publish spins for over a minute** | Reload the publish step and press **Publish…** again; the slug survives a republish. Or show the Night Market link from the reset. | "Here's one I published earlier." |
| **Page blank / server gone** | Restart `pnpm preview --port 4173` (no rebuild needed). | — |
| **Anything still broken after 30 s** | Switch to `demo-fallback.webm` and narrate over it. Afterwards, rerun `node scripts/demo-reset.mjs` before the next run. | "Let me show you the recorded run while that recovers." |

## Recording the fallback

`demo-fallback.webm` is a 1440×900 recording of the script above (about
95 s), made by Playwright against the preview build. It is ignored by git:
record it on the demo laptop, never commit it.

```bash
node scripts/demo-reset.mjs && RECORD=1 E2E_BASE_URL=http://localhost:4173 pnpm e2e demo-recording
```

The spec (`e2e/demo-recording.spec.ts`) is skipped unless `RECORD=1`. It
uses the demo account, so run `demo-reset` before and after it. It leaves
the draft unpublished, with the checkpoint and restore it made.
