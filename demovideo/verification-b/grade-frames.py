"""
grade-frames.py - grade OCR-extracted demo-video frames against an expected-text RUBRIC.

Each rubric entry is (label, why, list_of_required_substrings). An entry PASSES
if the COMBINED OCR text across all frames contains every one of its substrings
(case-insensitive, with a small OCR-confusion tolerance for i/l).

The report is deliberately explanatory: for every rubric row it records
  - what the row proves about the video (`why`),
  - which individual needles matched and which were missing (`matched`/`missing`),
so a reader can see EXACTLY why a row passed or failed instead of a bare code.

The RUBRIC lives in grade_frames_lib.py and is a contract with the captions/
verdict panels in demovideo/.runner/specs/full-walkthrough.spec.ts.
"""
import argparse
import json
import sys
from pathlib import Path

# Allow `from grade_frames_lib import ...` regardless of cwd
sys.path.insert(0, str(Path(__file__).parent))
from grade_frames_lib import ocr_text, RUBRIC  # noqa: E402


def _needle_ok(needle: str, haystack_lower: str) -> bool:
    """Case-insensitive containment with a tiny OCR i<->l confusion tolerance."""
    base = needle.lower()
    variants = {base, base.replace("i", "l"), base.replace("l", "i")}
    return any(v in haystack_lower for v in variants)


def grade(frames_dir, report_path):
    frames = sorted(Path(frames_dir).glob("frame_*.png"))
    if not frames:
        print("[verify-b] no frames in", frames_dir)
        return 1
    print(f"[verify-b] OCRing {len(frames)} frames...")
    all_text = []
    for fr in frames:
        all_text.append(ocr_text(fr))
    combined_lower = ("\n".join(all_text)).lower()

    results = []
    for row in RUBRIC:
        # Support both the new 3-tuple (label, why, needles) and any legacy
        # 2-tuple (label, needles) so the grader never crashes on shape drift.
        if len(row) == 3:
            label, why, needles = row
        else:
            label, needles = row
            why = ""
        matched = [n for n in needles if _needle_ok(n, combined_lower)]
        missing = [n for n in needles if not _needle_ok(n, combined_lower)]
        passed = not missing
        results.append({
            "rubric": label,
            "why": why,
            "passed": passed,
            "needles": needles,
            "matched": matched,
            "missing": missing,
        })
        flag = "PASS" if passed else "FAIL"
        print(f"  [{flag}] {label} - {why}")
        if not passed:
            print(f"         missing on screen: {', '.join(missing)}")

    pass_rate = sum(r["passed"] for r in results) / len(results)
    summary = {
        "frames": len(frames),
        "pass_rate": pass_rate,
        "passed": sum(r["passed"] for r in results),
        "total": len(results),
        "rubric": results,
    }
    Path(report_path).write_text(json.dumps(summary, indent=2))
    print(f"[verify-b] report -> {report_path} (pass rate: {pass_rate:.0%}, "
          f"{summary['passed']}/{summary['total']})")
    return 0 if pass_rate == 1.0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--report", required=True)
    args = ap.parse_args()
    sys.exit(grade(args.frames, args.report))
