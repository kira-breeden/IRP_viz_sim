"""
generate_counterbalancing.py

Reads current category counts from pair_summary.csv and produces a
pre-balanced participant assignment list that brings every category to
exactly TARGET_COUNT participants.

Outputs:
  trial_lists/counterbalancing.csv  — slot → cat1, cat2, cat3 for each new participant
  Prolific batch plan printed to stdout — unique triplets grouped with participant counts
"""

import csv
import re
from collections import defaultdict, Counter

PAIR_SUMMARY   = "pair_summary.csv"
OUTPUT_PATH    = "trial_lists/counterbalancing.csv"
FIRST_NEW_SLOT = 46    # next participant number (1-indexed)
TARGET_COUNT   = 21    # desired n_participants per category


def parse_category(pair):
    """
    Return category name for within-category pairs, None for identity pairs.
    Pair format: "candybar1_candybar2" (category) or "barrel1_barrel1" (identity).
    """
    left, right = pair.split("_", 1)
    if left == right:
        return None  # identity pair
    base_left  = re.sub(r"\d+$", "", left)
    base_right = re.sub(r"\d+$", "", right)
    return base_left if base_left == base_right else None


def read_current_counts(path):
    """Return {category: n_participants} using the minimum count across each category's pairs."""
    cat_counts = defaultdict(list)
    with open(path) as f:
        for row in csv.DictReader(f):
            cat = parse_category(row["pair"])
            if cat is not None:
                cat_counts[cat].append(int(row["n_participants"]))
    return {cat: min(counts) for cat, counts in cat_counts.items()}


def greedy_assignments(current_counts, target, first_slot):
    """
    Generate participant-slot → category triplet assignments using a greedy algorithm.

    At each step, the 3 categories with the lowest current counts are assigned
    (ties broken alphabetically for reproducibility). Continues until all categories
    reach the target.
    """
    counts = dict(current_counts)
    categories = sorted(counts.keys())

    total_deficit = sum(max(0, target - counts[c]) for c in categories)
    n_slots = -(-total_deficit // 3)  # ceiling division

    assignments = []
    for slot in range(first_slot, first_slot + n_slots):
        sorted_cats = sorted(categories, key=lambda c: (counts[c], c))
        triplet = tuple(sorted_cats[:3])
        assignments.append((slot, triplet))
        for cat in triplet:
            counts[cat] += 1

    return assignments, counts


def main():
    current_counts = read_current_counts(PAIR_SUMMARY)
    categories = sorted(current_counts.keys())

    print("=" * 60)
    print("CURRENT CATEGORY COUNTS (from pair_summary.csv)")
    print("=" * 60)
    for cat in sorted(categories, key=lambda c: current_counts[c]):
        n       = current_counts[cat]
        deficit = TARGET_COUNT - n
        bar     = "+" * n + "." * deficit
        print(f"  {cat:<22} n={n:>2}  need {deficit:>2} more  [{bar}]")
    print()

    assignments, final_counts = greedy_assignments(current_counts, TARGET_COUNT, FIRST_NEW_SLOT)

    # Write counterbalancing CSV
    with open(OUTPUT_PATH, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["slot", "cat1", "cat2", "cat3"])
        for slot, triplet in assignments:
            writer.writerow([slot, *triplet])

    # Prolific batch plan
    triplet_counts = Counter(triplet for _, triplet in assignments)
    sorted_batches = sorted(triplet_counts.items(), key=lambda x: (-x[1], x[0]))

    print("=" * 60)
    print(f"PROLIFIC BATCH PLAN  ({len(assignments)} participants, {len(triplet_counts)} batches)")
    print("=" * 60)
    print(f"  {'N':>3}  ?categories= value")
    print(f"  {'-'*3}  {'-'*50}")
    for triplet, n in sorted_batches:
        cats_param = "|".join(triplet)
        print(f"  {n:>3}  {cats_param}")
    print()
    print("  Full example URL (replace YOUR_URL):")
    first_triplet = sorted_batches[0][0]
    print(f"  YOUR_URL/index_v2.html?subjCode={{{{%PROLIFIC_PID%}}}}&categories={'|'.join(first_triplet)}")
    print()

    # Verify final counts
    print("=" * 60)
    print("FINAL COUNTS (after new participants)")
    print("=" * 60)
    all_ok = True
    for cat in sorted(categories):
        n  = final_counts[cat]
        ok = "OK" if n == TARGET_COUNT else "!!"
        print(f"  [{ok}] {cat:<22} {n}")
        if n != TARGET_COUNT:
            all_ok = False
    print()
    if all_ok:
        print(f"All {len(categories)} categories reach exactly {TARGET_COUNT} participants.")
    else:
        print("WARNING: Some categories did not reach target — check output above.")
    print()
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
