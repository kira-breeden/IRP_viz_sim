"""
Trial list generator for same/different image matching experiment.
Generates 5 condition files, each with ~176 trials (~45/55 yes/no split).

Structure:
- 80 "yes" trials: 10 identity images × 8 repeats (image vs itself)
- ~96 "no" trials: 2 categories × 6 within-category pairs × 8 repeats

Identity images: stimuli/identity/cat1.png (no other cats, just the one image)
Category images: stimuli/category/dog1.png, dog2.png, dog3.png, dog4.png

Conditions assign 2 categories each (no overlap):
  Condition 1: categories 1-2
  Condition 2: categories 3-4
  Condition 3: categories 5-6
  Condition 4: categories 7-8
  Condition 5: categories 9-10
"""

import csv
import random
import itertools
import os

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
# How many categories per condition
CATEGORIES_PER_CONDITION = 2

# How many repeats per unique comparison
REPEATS = 8

# Image directories (relative paths for use in the experiment)
IDENTITY_DIR = "images/identity"
CATEGORY_DIR = "images/category"
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
    """Generate all identity 'yes' trials: image vs itself, 8 repeats each."""
    trials = []
    for item in IDENTITY_ITEMS:
        img = f"{IDENTITY_DIR}/{item}1{IMAGE_EXT}"
        for _ in range(REPEATS):
            trials.append({
                "left_image": img,
                "right_image": img,
                "correct_response": "same",
                "trial_type": "identity",
                "category": item,
                "pair": f"{item}1_vs_{item}1",
                "randomize_lr": False
            })
    return trials


def make_category_trials(category_name):
    """Generate all within-category 'no' trials for one category, 8 repeats each.

    4 exemplars → C(4,2) = 6 unique pairs × 8 repeats = 48 trials.
    Left/right order is stored canonically here; randomize_lr=True signals the
    experiment code to randomly swap them at display time.
    """
    exemplars = [f"{CATEGORY_DIR}/{category_name}{i}{IMAGE_EXT}" for i in range(1, 5)]
    pairs = list(itertools.combinations(exemplars, 2))  # 6 unique pairs
    trials = []
    for img_a, img_b in pairs:
        for _ in range(REPEATS):
            trials.append({
                "left_image": img_a,
                "right_image": img_b,
                "correct_response": "different",
                "trial_type": "category",
                "category": category_name,
                "pair": f"{os.path.basename(img_a).replace(IMAGE_EXT,'')}_{os.path.basename(img_b).replace(IMAGE_EXT,'')}",
                "randomize_lr": True
            })
    return trials


def generate_condition(condition_num, category_subset):
    """Generate one full trial list for a condition."""
    all_trials = []

    # Identity trials (same for all conditions)
    all_trials.extend(make_identity_trials())

    # Category trials for this condition's subset
    for cat in category_subset:
        all_trials.extend(make_category_trials(cat))

    # Shuffle trial order
    random.shuffle(all_trials)

    # Add trial index
    for i, trial in enumerate(all_trials):
        trial["trial_index"] = i + 1
        trial["condition"] = condition_num

    return all_trials


def write_csv(trials, filepath):
    """Write trials to a CSV file."""
    if not trials:
        return
    fieldnames = ["trial_index", "condition", "trial_type", "category",
                  "pair", "left_image", "right_image", "correct_response", "randomize_lr"]
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(trials)


def print_summary(condition_num, trials, category_subset):
    """Print a summary of trial counts for a condition."""
    yes_trials = sum(1 for t in trials if t["correct_response"] == "same")
    no_trials = sum(1 for t in trials if t["correct_response"] == "different")
    total = len(trials)
    print(f"Condition {condition_num}: categories={category_subset}")
    print(f"  Total trials : {total}")
    print(f"  'same' (yes) : {yes_trials}  ({100*yes_trials/total:.1f}%)")
    print(f"  'diff' (no)  : {no_trials}  ({100*no_trials/total:.1f}%)")
    print()


def main():
    random.seed(42)  # Set seed for reproducibility; remove for true randomization

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Assign categories to conditions (2 per condition, no overlap)
    n_conditions = len(CATEGORY_ITEMS) // CATEGORIES_PER_CONDITION
    category_assignments = [
        CATEGORY_ITEMS[i * CATEGORIES_PER_CONDITION:(i + 1) * CATEGORIES_PER_CONDITION]
        for i in range(n_conditions)
    ]

    print("=" * 50)
    print("TRIAL LIST GENERATION SUMMARY")
    print("=" * 50)
    print(f"Identity items    : {len(IDENTITY_ITEMS)}")
    print(f"Category items    : {len(CATEGORY_ITEMS)}")
    print(f"Conditions        : {n_conditions}")
    print(f"Repeats/comparison: {REPEATS}")
    print()
    print("Identity trials (all conditions): "
          f"{len(IDENTITY_ITEMS)} items × {REPEATS} repeats = {len(IDENTITY_ITEMS)*REPEATS}")
    print("Category trials per condition: "
          f"{CATEGORIES_PER_CONDITION} categories × 6 pairs × {REPEATS} repeats = "
          f"{CATEGORIES_PER_CONDITION * 6 * REPEATS}")
    print()

    for i, cat_subset in enumerate(category_assignments):
        condition_num = i + 1
        trials = generate_condition(condition_num, cat_subset)
        filepath = os.path.join(OUTPUT_DIR, f"trials_condition_{condition_num}.csv")
        write_csv(trials, filepath)
        print_summary(condition_num, trials, cat_subset)
        print(f"  Saved to: {filepath}")

    print("=" * 50)
    print("Done! All trial lists saved to:", OUTPUT_DIR)
    print()
    print("NOTE: Item names are derived automatically from files in")
    print(f"  {IDENTITY_DIR}/ and {CATEGORY_DIR}/")


if __name__ == "__main__":
    main()
