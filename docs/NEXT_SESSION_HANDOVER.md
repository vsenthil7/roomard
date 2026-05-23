# NEXT SESSION HANDOVER — Roomard demo rework

**Written:** 2026-05-23 ~05:40 BST. Read this FIRST on a fresh page.

> This is a HACKATHON build (AT-Hack0019 "Build with MeDo", Baidu). Apply the
> hackathon working rules below, NOT generic personal-project habits.

---

## 0. Environment reality (read before doing anything)
- Windows host, user `v_sen`. Repo: `C:\Users\v_sen\Documents\Projects\0009_AT_Hack0019_Roomard\roomard`
- GitHub remote (PUBLIC): https://github.com/vsenthil7/roomard
- The **MCP shell/filesystem bridge degrades over long sessions** and goes
  unresponsive (happened ~19:50 and ~05:34). Symptom: tool calls time out at
  4 min though the underlying process is fine. FIX: user restarts the MCP
  servers (they did at 20:43). On a fresh page this resets. The
  `filesystem:read_text_file` tool sometimes survives when shell does not.
- Recordings run DETACHED and write a log file; always poll the log via the
  filesystem read tool rather than assuming a hang.

## 1. MANDATORY working discipline (hackathon rule — every change)
**COMMIT-FIRST → PUSH → TEST → TRACEABILITY, in that order, every CP.**
1. **Commit first** — never leave durable work uncommitted. Commit the work
   before moving on. (User: "commit all the work, don't discard.")
2. **Push** immediately after commit (`git push origin main`).
3. **Test** — verify (tsc + unit tests + frame-check the actual artifact, not
   just a green tick).
4. **Traceability** — update `docs/TRACEABILITY.md` (header CP#/date, total-tests
   line, commit-row, demo-status note) AND push it. Updating traceability and
   pushing it is MANDATORY after every push — it is not optional and not "later".
- One CP = one logical change, SHA-traceable. The user actively audits TRACEABILITY.
- BACK UP anything not in git before changing it: copy to
  `_session/_backup/<yyyyMMdd_HHmmss>_<label>/` (create the subfolder). If a file
  IS in git, git is the backup — but still never `git rm` something the user has
  asked to keep without backing it up first.

## 2. The demo is THE deliverable — and it must follow the 3-step structure
The user has rejected "static" cuts repeatedly. Every test-case clip MUST be
three DISTINCT beats (do NOT fuse step 2 and step 3):

**Step 1 — TEST CASE.** A scene card naming the case (GIVEN / WHEN / THEN).

**Step 2 — SCREEN FLOW (the STORYBOARD).** This is the missing piece. It is a
*storyboard / happy-path user-journey panel* (software-market standard term:
"click-through walkthrough" / "user journey storyboard"). It is its OWN beat,
shown BEFORE the live run. It is a filmstrip of the screens the user will move
through, each annotated with: what's on the screen, what the user does, and
**what it produces / how that data feeds the next screen** (data lineage). Think
of the user's own example:
```
Login [blank] -> [filled] -> press Sign in   ==> produces a session
   v
Property [blank] -> [name/code/city filled] -> Create   ==> POST /v1/properties => a property row exists
   v
Guest [blank] -> [name filled] -> Save   ==> POST /v1/guests => guest attached to that property
   v
Generate brief [click]   ==> POST /v1/briefs/generate => brief built from that guest
   v
"Hotel is live" => shows the property + guest + brief that the steps created
```
The point of step 2 is to make the **data lineage explicit** — where every piece
of data on each screen came from. One panel; two only if genuinely too much.

**Step 3 — LIVE TEST.** The real browser walks that EXACT path live (typing,
clicking, uploading) and a verdict panel runs a real API assertion whose results
match the storyboard. Step 3 is genuinely live today (real POST/GET/PATCH, real
DB, real 200/201) — that part is solid. What's missing is the SEPARATE step-2
storyboard. Currently step 2 and step 3 are fused (banners over the live run).

### Per-clip honest status (audited 05:24)
| Clip | step1 | step2 storyboard | step3 live | data lineage shown? |
|------|-------|------------------|-----------|---------------------|
| 01 onboarding | yes | NO (fused) | yes | yes (created live) |
| 02 brief | yes | NO | yes | NO (pre-seeded, unexplained) |
| 03 guest | yes | NO | yes | NO (pre-seeded) |
| 04 capture | yes | NO | yes | partial — card image NOT shown, prefs not dwelt on |
| 05 prep | yes | NO | yes | NO (pre-seeded) |
| 06 exception | yes | NO | yes | partial (item pre-seeded, resolve shown) |

## 3. CRITICAL truthfulness bug found 05:32 (fix committed? verify)
The bundled demo card `demo/checkin-card.png` is **The Cobbled Yard / Eleanor M.
Whitcombe**: firm pillows (two extra), no shellfish, oat milk, quiet room, late
checkout, returning guest (3rd stay). But the MOCK OCR
(`services/ai-gateway/src/mock-provider.ts`, used when `AI_GATEWAY_MOCK=true`)
hardcoded "Earl Grey tea" + "Two firm pillows" regardless of the image. So the
demo showed a card and "extracted" totally different prefs — a credibility
killer any judge would catch.
- FIX MADE (uncommitted as of 05:34): `mockOcr` now detects the demo card (by
  base64 length band 30k-200k) and returns fields that MATCH the card (firm
  pillows 0.93, no shellfish 0.90, oat milk 0.88, quiet room 0.84, late checkout
  **0.62** — the 0.62 conveniently feeds the exception-queue low-confidence clip).
- TODO: this WILL break ai-gateway snapshot/unit tests that assert "Earl Grey
  tea" (`services/ai-gateway/tests/unit/mock-provider.test.ts` and others found
  via grep). Update those tests, then commit+push+traceability.
- TODO: re-seed the demo guest preferences to match the card so guest/brief/prep
  clips are consistent with what capture extracts.

## 4. Plan for the rework (in order)
1. Commit the mock-provider truthfulness fix + update its tests. (commit-first)
2. Add a **card-image preview** to the capture UI (`apps/web/src/routes/captures.new.tsx`)
   — real product improvement: the agent sees the photo they attached. (Then the
   capture clip can show "what we have".)
3. Build the **step-2 storyboard panel** helper (a new overlay in
   `demovideo/.runner/specs/caption-overlay.ts`, e.g. `showStoryboard(page, {steps:[...]})`
   rendering the blank->filled->action->produces filmstrip). Roll out to
   ONBOARDING first as the template, show the user, get approval BEFORE doing the
   other 5.
4. Capture clip: show the card image, upload, dwell on the extracted prefs that
   now MATCH the card.
5. brief/guest/prep: add data-lineage to the storyboard ("this pref came from the
   card scanned in the capture step / arrivals come from PMS sync").
6. Re-record all, WATCH the full video in motion (extract a dense frame sequence,
   ~1 frame / 2s, and actually read them — do NOT just check the verdict frame),
   re-concat, commit+push+traceability.

## 5. Demo recording mechanics (proven, reuse)
- Per-clip specs: `demovideo/.runner/specs/clip-00..07-*.spec.ts` + `clip-helpers.ts`
  + `caption-overlay.ts`. One short Playwright spec per clip; concatenated
  losslessly with ffmpeg. A hang only costs one short clip.
- Record one clip: `_session\recordclip.bat <clip-name>` (launch detached via
  `Start-Process -WindowStyle Hidden`, then poll
  `demovideo\.runner\clips\<clip>.log` with the filesystem read tool).
- Concat all 8: `powershell -File _session\concat.ps1` -> dated mp4 in `demo/`.
- Raw clips (`demovideo/.runner/clips/`) are gitignored (regenerable); the
  committed source of truth is the SPECS; the final concatenated mp4 in `demo/`
  IS committed. Latest committed cut: `demo/roomard-walkthrough-20260522_205915-main.mp4`.
- Helpers available: showSceneCard, showStepBanner, showVerdict, clearBanner,
  clearOverlay, typeInto, selectOptionByTestId, highlightAndClick, pause,
  signInAndGetToken, liveCall, scrollTopToBottom. (Need to ADD: showStoryboard.)
- Onboarding clip creates a REAL property+guest live -> MUST clean up after:
  delete `properties.name LIKE 'The Riverside Hotel%'` (+ its briefs/stays) and
  the dup guest, so the seeded demo tenant stays at 1 property / 3 guests.
- Demo tenant: tenant `00000000-0000-4000-8000-000000000001`, property
  `Roomard Demo Hotel London` id `...010`. 3 guests: James Patel (attention),
  Sofia Henrik, Rashida Ali. Today=2026-05-22 in seed; arrivals 3 today + 3 tmrw.
  Exception currently `resolved` (clip-06 resolved it live) — flip back to `open`
  before re-recording clip-06: `UPDATE exception_queue_items SET status='open',
  resolved_at=NULL, resolved_by=NULL, resolution=NULL WHERE kind='low_ocr_confidence';`

## 6. State at handover (05:40)
- Repo clean & pushed at CP-96 (`b94ec8a`) EXCEPT the uncommitted mock-provider.ts
  fix from 05:32. CONFIRM with `git status -sb` and `git diff --stat` first thing.
- 13 production bugs (G-44..G-56) fixed this session by building the demo for
  real (card-capture pipeline + guest creation were silently broken).
- Backups: `_session/_backup/20260523_0527_pre_clip_rework/` (21 files),
  `_session/_backup/20260523_053250_onboarding_q/`, `_session/clip_backup/`.

## 7. Memory / Claude-rules note (for the USER to action — Claude cannot edit these)
- The Project memory and Claude rules live in the Claude Project settings, NOT in
  this repo; Claude cannot edit them from the filesystem and must not try.
- User's intent: keep the **memory file very thin** — it should just say
  "read from the Claude rule (index)". And restructure the **Claude rule** as an
  INDEX that points to specific rule files (e.g. this handover, TRACEABILITY,
  the 3-step demo spec). A draft thin-memory text + rule-index structure is in
  `_session/MEMORY_AND_RULES_DRAFT.md` for the user to paste into the Project.
