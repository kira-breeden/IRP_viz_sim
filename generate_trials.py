"""
Trial list generator for same/different image matching experiment.
Generates three static CSV files:

  identity_trials.csv  — all identity "same" trials (every participant sees all of these)
  category_trials.csv  — all "different" trials for every category
  practice_trials.csv  — full pool of practice pairs (same + different)

At runtime, experiment.js uses a per-participant seed to:
  - randomly sample 3 categories from category_trials.csv
  - sample PRACTICE_TRIALS_PER_TYPE same and different trials from practice_trials.csv

Per-participant trial counts (with 3 sampled categories):
  Practice : PRACTICE_TRIALS_PER_TYPE × 2 (same + different)
  Identity : N_identity × REPEATS
  Category : 3 categories × 6 pairs × REPEATS
"""

import csv
import itertools
import os

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
# How many repeats per unique comparison
REPEATS = 8

# Image directories (relative paths for use in the experiment)
IDENTITY_DIR = "stimuli/images/identity"
CATEGORY_DIR = "stimuli/images/category"
PRACTICE_DIR = "stimuli/images/practice"
IMAGE_EXT = ".png"

# Output directory
OUTPUT_DIR = "trial_lists"

# Derive item names dynamically from filenames in each directory.
# Strips the last 5 characters (exemplar digit + ".png") to get the base name,
# e.g. "apple1.png" -> "apple", then collects unique sorted names.
IDENTITY_ITEMS = sorted({f[:-5] for f in os.listdir(IDENTITY_DIR) if f.endswith(IMAGE_EXT)})
CATEGORY_ITEMS = sorted({f[:-5] for f in os.listdir(CATEGORY_DIR) if f.endswith(IMAGE_EXT)})
# ──────────────────────────────────────────────────────────────────────────────


def make_identity_trials():
    """Generate all identity 'same' trials: image vs itself, REPEATS times each."""
    trials = []
    for item in IDENTITY_ITEMS:
        img = f"{IDENTITY_DIR}/{item}1{IMAGE_EXT}"
        for _ in range(REPEATS):
            trials.append({
                "trial_type": "identity",
                "category": item,
                "pair": f"{item}1_vs_{item}1",
                "left_image": img,
                "right_image": img,
                "correct_response": "same",
                "randomize_lr": False
            })
    return trials


def make_category_trials(category_name):
    """Generate all within-category 'different' trials for one category.

    4 exemplars → C(4,2) = 6 unique pairs × REPEATS = 48 trials.
    Left/right order is stored canonically here; randomize_lr=True signals the
    experiment code to randomly swap them at display time.
    """
    exemplars = [f"{CATEGORY_DIR}/{category_name}{i}{IMAGE_EXT}" for i in range(1, 5)]
    pairs = list(itertools.combinations(exemplars, 2))  # 6 unique pairs
    trials = []
    for img_a, img_b in pairs:
        for _ in range(REPEATS):
            trials.append({
                "trial_type": "category",
                "category": category_name,
                "pair": f"{os.path.basename(img_a).replace(IMAGE_EXT,'')}_{os.path.basename(img_b).replace(IMAGE_EXT,'')}",
                "left_image": img_a,
                "right_image": img_b,
                "correct_response": "different",
                "randomize_lr": True
            })
    return trials


def make_practice_trials():
    """Generate the full pool of practice trial pairs.

    Same trials  : each image paired with itself (N rows).
    Diff trials  : every unique pairing of two different images (C(N,2) rows).
    experiment.js samples PRACTICE_TRIALS_PER_TYPE of each at runtime using the seed.
    """
    images = sorted([
        f"{PRACTICE_DIR}/{f}"
        for f in os.listdir(PRACTICE_DIR)
        if f.endswith(IMAGE_EXT)
    ])
    trials = []

    # Same pairs
    for img in images:
        stem = os.path.basename(img).replace(IMAGE_EXT, "")
        trials.append({
            "trial_type": "same",
            "category": "",
            "pair": f"{stem}_vs_{stem}",
            "left_image": img,
            "right_image": img,
            "correct_response": "same",
            "randomize_lr": False
        })

    # Different pairs (all C(N,2) combinations)
    for img_a, img_b in itertools.combinations(images, 2):
        stem_a = os.path.basename(img_a).replace(IMAGE_EXT, "")
        stem_b = os.path.basename(img_b).replace(IMAGE_EXT, "")
        trials.append({
            "trial_type": "different",
            "category": "",
            "pair": f"{stem_a}_vs_{stem_b}",
            "left_image": img_a,
            "right_image": img_b,
            "correct_response": "different",
            "randomize_lr": True
        })

    return trials


def write_csv(trials, filepath):
    """Write trials to a CSV file."""
    if not trials:
        return
    fieldnames = ["trial_type", "category", "pair",
                  "left_image", "right_image", "correct_response", "randomize_lr"]
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(trials)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── Identity trials (static; every participant sees all of these) ──────────
    identity_trials = make_identity_trials()
    identity_path = os.path.join(OUTPUT_DIR, "identity_trials.csv")
    write_csv(identity_trials, identity_path)

    # ── Category trials (all categories; experiment JS samples 3 per participant)
    category_trials = []
    for cat in CATEGORY_ITEMS:
        category_trials.extend(make_category_trials(cat))
    category_path = os.path.join(OUTPUT_DIR, "category_trials.csv")
    write_csv(category_trials, category_path)

    # ── Practice trials (full pool; experiment JS samples 10+10 per participant)
    practice_trials = make_practice_trials()
    practice_path = os.path.join(OUTPUT_DIR, "practice_trials.csv")
    write_csv(practice_trials, practice_path)
    n_practice_same = sum(1 for t in practice_trials if t["correct_response"] == "same")
    n_practice_diff = sum(1 for t in practice_trials if t["correct_response"] == "different")

    # ── Summary ────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("TRIAL LIST GENERATION SUMMARY")
    print("=" * 50)
    print(f"Identity items    : {len(IDENTITY_ITEMS)}")
    print(f"Category items    : {len(CATEGORY_ITEMS)}")
    print(f"Practice images   : {n_practice_same}")
    print(f"Repeats/comparison: {REPEATS}")
    print()
    print(f"identity_trials.csv  : {len(identity_trials)} trials")
    print(f"  ({len(IDENTITY_ITEMS)} items × {REPEATS} repeats)")
    print(f"category_trials.csv  : {len(category_trials)} trials total")
    print(f"  ({len(CATEGORY_ITEMS)} categories × 6 pairs × {REPEATS} repeats)")
    print(f"practice_trials.csv  : {len(practice_trials)} trials in pool")
    print(f"  ({n_practice_same} same + {n_practice_diff} different)")
    print()
    print("Per-participant at runtime (seed-sampled):")
    print(f"  Practice : 10 same + 10 different = 20")
    print(f"  Identity : {len(identity_trials)}")
    print(f"  Category : {3 * 6 * REPEATS}")
    print(f"  Total    : {20 + len(identity_trials) + 3 * 6 * REPEATS}")
    print()
    print(f"Saved: {identity_path}")
    print(f"Saved: {category_path}")
    print(f"Saved: {practice_path}")
    print()
    print("NOTE: Item names are derived automatically from files in")
    print(f"  {IDENTITY_DIR}/, {CATEGORY_DIR}/, and {PRACTICE_DIR}/")


if __name__ == "__main__":
    main()
