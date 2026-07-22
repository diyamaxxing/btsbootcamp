#!/usr/bin/env python3
"""
Tokenizes every video title into individual words and tallies how often each
word appears, broken down by which `type` it shows up in. Purely an internal
analysis tool — it doesn't touch videos.json or any shipped file.

Use this to spot words that recur often enough across a type (especially a
broad/mixed one like "BTS On Air") to justify a new CATEGORY_PATTERNS entry
in build_videos_json.py, instead of guessing at a pattern (see the
Behind/Sketch/Episode TODO in CLAUDE.md).

Usage:
    python3 scripts/word_frequency.py                  # top words, all types
    python3 scripts/word_frequency.py --type "BTS On Air"
    python3 scripts/word_frequency.py --min-count 10 --top 100
"""

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

VIDEOS_FILE = Path(__file__).parent.parent / "data" / "videos.json"

# generic noise words that show up everywhere and don't distinguish content —
# not a stopword list for English prose, just for BTS video titles specifically
STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "with",
    "is", "are", "be", "by", "from",
    "bts", "bangtan", "official", "ver", "feat", "ft", "pt", "vol",
}

WORD_PATTERN = re.compile(r"[a-zA-Z0-9']+")


def tokenize(title):
    return {
        w.lower() for w in WORD_PATTERN.findall(title)
        if len(w) > 1 and w.lower() not in STOPWORDS
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", default=None, help="Only analyze videos of this type")
    parser.add_argument("--min-count", type=int, default=5)
    parser.add_argument("--top", type=int, default=50)
    args = parser.parse_args()

    videos = json.loads(VIDEOS_FILE.read_text())
    if args.type:
        videos = [v for v in videos if v["type"] == args.type]
    print(f"Analyzing {len(videos)} videos" + (f" (type={args.type})" if args.type else ""))

    word_counts = Counter()
    word_types = defaultdict(Counter)
    word_examples = defaultdict(list)

    for v in videos:
        for w in tokenize(v["title"]):
            word_counts[w] += 1
            word_types[w][v["type"]] += 1
            if len(word_examples[w]) < 3:
                word_examples[w].append(v["id"])

    ranked = [w for w, c in word_counts.most_common() if c >= args.min_count]

    print(f"\n{len(ranked)} words with count >= {args.min_count}\n")
    print(f"{'WORD':<20} {'COUNT':>6}  TYPE BREAKDOWN")
    print("-" * 90)
    for w in ranked[:args.top]:
        types_str = ", ".join(f"{t}:{c}" for t, c in word_types[w].most_common())
        print(f"{w:<20} {word_counts[w]:>6}  {types_str}")


if __name__ == "__main__":
    main()
