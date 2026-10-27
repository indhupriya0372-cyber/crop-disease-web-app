"""Evaluate the AgriCare AI model on the labelled sample set.

Runs every image listed in samples/manifest.json through the same pipeline the
website uses (predictor.predict_image_bytes) and reports top-1 accuracy.

Run:
    python generate_samples.py --per-class 8   # make the test set first
    python evaluate_model.py

Outputs:
    samples/evaluation_results.csv   (per-image prediction vs expected label)

If model/crop_cnn.h5 exists the real CNN is used; otherwise the built-in
demo heuristic runs (so you can measure the baseline before training).
"""

import argparse
import csv
import json
import os
from collections import defaultdict
from pathlib import Path

import predictor

BASE_DIR = Path(__file__).parent
SAMPLES = BASE_DIR / "samples"
MANIFEST = SAMPLES / "manifest.json"


def normalize(key):
    return (key or "").lower().replace("-", "_").replace(" ", "_")


def main():
    parser = argparse.ArgumentParser(description="Evaluate model on labelled samples.")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--limit", type=int, default=0, help="evaluate only N images")
    parser.add_argument("--csv", type=Path, default=SAMPLES / "evaluation_results.csv")
    args = parser.parse_args()

    if not args.manifest.exists():
        print("No manifest found. Run: python generate_samples.py")
        return

    with open(args.manifest, encoding="utf-8") as fh:
        samples = json.load(fh)
    if args.limit:
        samples = samples[: args.limit]

    real = predictor._load_model() is not None
    print("Model source: %s" % ("REAL CNN (model/crop_cnn.h5)" if real else "demo heuristic"))
    print("Evaluating %d samples...\n" % len(samples))

    per_class_total = defaultdict(int)
    per_class_correct = defaultdict(int)
    rows = []
    correct = 0
    level_correct = 0

    for s in samples:
        path = SAMPLES / s["file"]
        if not path.exists():
            continue
        expected = normalize(s.get("key") or s.get("label"))
        expected_level = (s.get("level") or "").lower()
        try:
            with open(path, "rb") as fh:
                preds = predictor.predict_image_bytes(fh.read())
            top = preds[0] if preds else {}
            predicted = normalize(top.get("key"))
            predicted_level = (top.get("level") or "").lower()
        except Exception as exc:  # pragma: no cover
            top, predicted, predicted_level = {}, "error:%s" % exc, ""

        ok = predicted == expected
        correct += int(ok)
        if expected_level and predicted_level:
            level_correct += int(predicted_level == expected_level)
        per_class_total[expected] += 1
        per_class_correct[expected] += int(ok)
        rows.append({
            "file": s["file"],
            "expected": expected,
            "predicted": predicted,
            "confidence": top.get("confidence", ""),
            "correct": ok,
            "expected_level": expected_level,
            "predicted_level": predicted_level,
        })

    total = len(rows)
    print("Top-1 exact-class accuracy: %d/%d = %.1f%%" % (
        correct, total, (correct / total * 100) if total else 0.0))
    print("Health-level agreement:     %d/%d = %.1f%%\n" % (
        level_correct, total, (level_correct / total * 100) if total else 0.0))

    print("%-38s %5s %5s %7s" % ("CLASS", "N", "OK", "ACC"))
    print("-" * 60)
    for key in sorted(per_class_total):
        n = per_class_total[key]
        ok = per_class_correct[key]
        print("%-38s %5d %5d %6.0f%%" % (key, n, ok, ok / n * 100))

    args.csv.parent.mkdir(parents=True, exist_ok=True)
    with open(args.csv, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            "file", "expected", "predicted", "confidence", "correct",
            "expected_level", "predicted_level",
        ])
        writer.writeheader()
        writer.writerows(rows)
    print("\nPer-image results -> %s" % args.csv)
    if not real:
        print("Note: demo heuristic cannot name exact crop+disease keys. "
              "Train the CNN (train_cnn.py) for real class-level accuracy.")


if __name__ == "__main__":
    main()
