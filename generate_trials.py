"""
Trial list generator for same/different image matching experiment.
Generates two static CSV files:

  identity_trials.csv  — all identity "same" trials (every participant sees all of these)
  category_trials.csv  — all "different" trials for every category

At runtime, experiment.js uses a per-participant seed to randomly sample
3 categories from category_trials.csv, then combines with identity_trials.csv
and shuffles to produce that participant's trial order.

Per-participant trial counts (with 3 sampled categories):
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

    # ── Summary ────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("TRIAL LIST GENERATION SUMMARY")
    print("=" * 50)
    print(f"Identity items    : {len(IDENTITY_ITEMS)}")
    print(f"Category items    : {len(CATEGORY_ITEMS)}")
    print(f"Repeats/comparison: {REPEATS}")
    print()
    print(f"identity_trials.csv : {len(identity_trials)} trials")
    print(f"  ({len(IDENTITY_ITEMS)} items × {REPEATS} repeats)")
    print(f"category_trials.csv : {len(category_trials)} trials total")
    print(f"  ({len(CATEGORY_ITEMS)} categories × 6 pairs × {REPEATS} repeats)")
    print()
    print("Per-participant at runtime (3 categories sampled by seed):")
    print(f"  Identity : {len(identity_trials)}")
    print(f"  Category : {3 * 6 * REPEATS}")
    print(f"  Total    : {len(identity_trials) + 3 * 6 * REPEATS}")
    print()
    print(f"Saved: {identity_path}")
    print(f"Saved: {category_path}")
    print()
    print("NOTE: Item names are derived automatically from files in")
    print(f"  {IDENTITY_DIR}/ and {CATEGORY_DIR}/")


if __name__ == "__main__":
    main()
