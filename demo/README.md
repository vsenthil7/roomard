# Roomard — product walkthrough demo

**Current cut:** `roomard-walkthrough-20260522_205915-main.mp4` — ~3m19s, 1.64 MB.

This is a recorded, end-to-end walkthrough of Roomard (the AI guest-memory engine
for boutique hotels) running against the real local stack — every screen is the
real product, every result is a real API call against the running services and
database. Nothing is mocked or faked for the camera.

## What you're watching

The video tells the story of one boutique hotel going live on Roomard, then
working a normal day. It is **action-driven**: the product is shown being *used*
— typed into, clicked through, uploaded to, resolved — not toured as static
screenshots.

Every use case is presented in three beats:

1. **Test case** — a title card naming the case (GIVEN / WHEN / THEN).
2. **Screen flow** — each screen is walked with an on-screen banner explaining
   what is happening *while the action runs live*.
3. **Live test** — a verdict panel runs a real API assertion against the running
   stack and shows the product's actual returned values with PASS/FAIL. The
   assertions match the flow that was just shown.

## The clips, in order

| # | Clip | What it demonstrates |
|---|------|----------------------|
| 00 | Intro | Title card — what Roomard is. |
| 01 | Onboarding | A new hotel from zero: **types** the property name + short code + city, **adds** a guest, **generates** the first daily brief — the wizard advances step-by-step to "your hotel is live". |
| 02 | Daily brief | The morning arrival brief: ranked arrivals, who needs attention, and a drafted "say this" greeting per guest. |
| 03 | Guest profile | A returning guest's learned preferences, the say-this suggestion, recent stays and issues. |
| 04 | Card capture (OCR) | **Uploads** a hand-written check-in card; PaddleOCR-VL extracts the preferences (e.g. "Earl Grey tea", "two firm pillows") and saves them to the guest. |
| 05 | Housekeeping prep | Per-room prep cards with the real actionable items each arriving guest needs. |
| 06 | Exception queue | A low-confidence OCR read is queued for a human; the agent **resolves** it live and it moves to the Resolved tab — nothing is saved to a guest on a guess. |
| 07 | Outro | Closing card. |

## How it's built

The walkthrough is recorded as **one short Playwright spec per clip**
(`demovideo/.runner/specs/clip-00-intro.spec.ts` … `clip-07-outro.spec.ts`),
then concatenated losslessly with ffmpeg. This per-clip approach means a single
recording hang only ever costs one short clip, and any one use case can be
re-recorded independently without re-running the whole thing.

Shared overlay and interaction helpers live in
`demovideo/.runner/specs/caption-overlay.ts` and `clip-helpers.ts`
(`showSceneCard`, `showStepBanner`, `showVerdict`, `typeInto`,
`highlightAndClick`, spotlight ring, etc.).

### Regenerating

With the local stack running (`docker compose up -d`) and the demo data seeded:

```
# record one clip
_session/recordclip.bat clip-01-onboarding

# concatenate all eight into a fresh dated cut in demo/
powershell -File _session/concat.ps1
```

Raw per-clip recordings (`demovideo/.runner/clips/`) are gitignored as
regenerable binaries; the committed source of truth is the specs. The final
concatenated MP4 in this folder is committed.

## Notes

- `checkin-card.png` is the sample hand-written card used by the capture clip.
- The walkthrough runs against the seeded demo tenant (one property, three
  guests, today + tomorrow arrivals). Building the demo against the real stack
  surfaced and fixed 13 production bugs (see `docs/TRACEABILITY.md`, G-44…G-56),
  most importantly the entire card-capture/OCR pipeline and guest creation.
