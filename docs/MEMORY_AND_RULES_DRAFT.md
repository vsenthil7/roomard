# MEMORY & CLAUDE-RULES DRAFT (for the USER to paste into the Claude Project)

Claude cannot edit Project memory or Claude rules from the filesystem. These are
DRAFTS for you to paste into the Claude Project settings yourself.

================================================================================
A) THIN MEMORY — paste this as the entire memory (keep it minimal on purpose)
================================================================================

Senthil runs competitive AI/no-code hackathons (currently AT-Hack0019 "Build
with MeDo", Baidu) and treats them as serious enterprise product-strategy
exercises. British English, direct tone, no flattery, technical-buyer rigour.

For ALL working rules, conventions, git discipline, demo standards, and current
project state: READ FROM THE CLAUDE RULE INDEX. Do not rely on memory for
process — the rule index is the single source of truth and is kept current.

(That's it. Everything operational lives in the rule index, not here.)

================================================================================
B) CLAUDE RULE — restructure as an INDEX that points to rule files
================================================================================

# Claude Rule Index (AT-Hack0019 / Roomard)

This is an INDEX. Each numbered item points to the authoritative file. Read the
relevant file rather than relying on memory.

1. CONTEXT: This is a HACKATHON build. Apply hackathon rules, not generic
   personal-project habits. Repo:
   C:\Users\v_sen\Documents\Projects\0009_AT_Hack0019_Roomard\roomard

2. WORKING DISCIPLINE (mandatory, every change):
   COMMIT-FIRST -> PUSH -> TEST -> TRACEABILITY (update docs/TRACEABILITY.md and
   push it). Traceability after push is mandatory, not optional.
   -> Full detail: _session/NEXT_SESSION_HANDOVER.md section 1.

3. DEMO STANDARD (the deliverable): every test-case clip = 3 DISTINCT beats:
   (1) TEST CASE card, (2) SCREEN-FLOW STORYBOARD (own beat, shows blank->filled
   ->action->what-it-produces + data lineage), (3) LIVE TEST walking that exact
   path. Do not fuse beats 2 and 3. Never ship a "static" cut.
   -> Full detail: _session/NEXT_SESSION_HANDOVER.md section 2.

4. CURRENT STATE + NEXT STEPS + truthfulness fix (card<->extraction):
   -> _session/NEXT_SESSION_HANDOVER.md sections 3-6.

5. ENVIRONMENT: Windows; MCP shell/filesystem bridge degrades over long sessions
   and needs restarting; recordings run detached (poll the log file).
   -> _session/NEXT_SESSION_HANDOVER.md section 0.

6. PRODUCT/STRATEGY ARTEFACTS (BRDs, rankings, cross-AI benchmarking) live in the
   Project knowledge files (01_..05_, AT-Hack0019_* matrices). One idea per
   response; downloadable markdown per deliverable; quantification mandatory.

7. STANDING PREFERENCES: British English; direct, no flattery; call out padding/
   weak content explicitly; verify for real (frame-check artifacts, don't trust
   green ticks); hackathon depth/credibility over time-to-submit.

================================================================================
NOTE on updating the rule index in future
================================================================================
When a durable new convention is agreed, add a one-line pointer here and put the
detail in a repo file (docs/ or _session/). Keep this index short; push detail
into files. Do not bloat memory.
