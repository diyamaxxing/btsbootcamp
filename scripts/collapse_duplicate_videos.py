#!/usr/bin/env python3
"""
One-time cleanup: collapses videos that appear as two separate rows across
data/raws/*.csv (same YouTube video ID) into a single row.

Found while importing content_index.csv (see ARCHITECTURE_DECISIONS.md) —
predates that import, unrelated to it. Two distinct causes, handled
differently:

1. Same-type duplicates (32 of 40 found) — the exact same video listed
   twice within one official YouTube playlist (identical title, type,
   view/like counts). Zero information loss either way: the later row is
   just deleted. fetch_playlists.py now also dedupes within a single
   playlist fetch so this doesn't come back (see its own docstring).

2. Cross-type duplicates (8 of 40 found) — the exact same video legitimately
   listed under two DIFFERENT official playlists (e.g. a Bangtan Bomb also
   in the Dance Practice playlist), with no textual marker in the title
   distinguishing that fact, so build_videos_json.py's title-pattern tagging
   can't recover it automatically. The row from whichever CSV comes first in
   CSV_FILES processing order is kept as canonical `type`; the other type
   name is written into that row's `extra_tags` column (merged into `tags`
   by compute_tags() at build time — see build_videos_json.py), and the
   other row is deleted. This is NOT caught by fetch_playlists.py's
   within-playlist dedup, since each playlist is fetched independently —
   a genuine cross-playlist duplicate would come back on a future refetch
   and need this script run again.

Usage:
    python3 scripts/collapse_duplicate_videos.py            # dry run
    python3 scripts/collapse_duplicate_videos.py --apply
"""

import csv
import re
import sys
from pathlib import Path

RAWS_DIR = Path(__file__).parent.parent / "data" / "raws"

# Same processing order as build_videos_json.py / tag_members.py — first in
# this list wins as the canonical row when a duplicate spans two files.
CSV_FILES = [
    "mvs.csv",
    "bangtan_bombs.csv",
    "dance_practices.csv",
    "run_bts.csv",
    "bts_episodes.csv",
    "bts_on_air.csv",
    "content_index.csv",
]

TYPE_BY_FILE = {
    "mvs.csv":              "MV",
    "bangtan_bombs.csv":    "Bangtan Bomb",
    "dance_practices.csv":  "Dance Practice",
    "run_bts.csv":          "Run BTS",
    "bts_episodes.csv":     "BTS Episode",
    "bts_on_air.csv":       "BTS On Air",
    "content_index.csv":    "Archive",
}

YOUTUBE_ID_RE = re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})")


def extract_video_id(url):
    match = YOUTUBE_ID_RE.search(url or "")
    return match.group(1) if match else None


def load_all():
    """Returns {filename: (fieldnames, rows)}."""
    data = {}
    for filename in CSV_FILES:
        path = RAWS_DIR / filename
        if not path.exists():
            continue
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            data[filename] = (reader.fieldnames, list(reader))
    return data


def main(dry_run=True):
    data = load_all()

    by_video_id = {}  # video_id -> list of (filename, row_index)
    for filename, (_, rows) in data.items():
        for i, row in enumerate(rows):
            vid = extract_video_id(row.get("url", ""))
            if not vid:
                continue
            by_video_id.setdefault(vid, []).append((filename, i))

    dupes = {vid: locs for vid, locs in by_video_id.items() if len(locs) > 1}
    print(f"{'DRY RUN — ' if dry_run else ''}Found {len(dupes)} duplicate video-id groups\n")

    to_delete = {filename: set() for filename in data}  # filename -> set of row indices
    same_type_count = 0
    cross_type_count = 0

    for vid, locs in dupes.items():
        # canonical = earliest in CSV_FILES order
        locs_sorted = sorted(locs, key=lambda loc: CSV_FILES.index(loc[0]))
        canon_file, canon_idx = locs_sorted[0]
        canon_row = data[canon_file][1][canon_idx]
        other_locs = locs_sorted[1:]

        other_types = set()
        for filename, idx in other_locs:
            other_types.add(TYPE_BY_FILE[filename])
            to_delete[filename].add(idx)

        canon_type = TYPE_BY_FILE[canon_file]
        other_types.discard(canon_type)

        dropped_ids = [data[f][1][i]["id"] for f, i in other_locs]

        if other_types:
            cross_type_count += 1
            existing_extra = [t.strip() for t in canon_row.get("extra_tags", "").split("|") if t.strip()]
            merged_extra = existing_extra + [t for t in sorted(other_types) if t not in existing_extra]
            print(f"  [{vid}] keep {canon_file}:{canon_row['id']} (type={canon_type}), "
                  f"extra_tags += {sorted(other_types)}, drop {dropped_ids}")
            if not dry_run:
                canon_row["extra_tags"] = "|".join(merged_extra)
        else:
            same_type_count += 1
            if dry_run:
                print(f"  [{vid}] keep {canon_file}:{canon_row['id']} (type={canon_type}), "
                      f"drop identical {dropped_ids}")

    print(f"\n{same_type_count} same-type groups, {cross_type_count} cross-type groups")

    if not dry_run:
        for filename, (fieldnames, rows) in data.items():
            deleted = to_delete[filename]
            # any row in this file may have just gotten extra_tags set (as
            # the canonical row of a cross-type group) even if none of ITS
            # rows are being deleted, so check for that too, not just deletes
            touched_extra_tags = any("extra_tags" in row and row.get("extra_tags") for row in rows)
            if not deleted and not touched_extra_tags:
                continue
            out_fieldnames = list(fieldnames)
            if "extra_tags" not in out_fieldnames:
                out_fieldnames.append("extra_tags")
            kept_rows = [row for i, row in enumerate(rows) if i not in deleted]
            path = RAWS_DIR / filename
            with open(path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=out_fieldnames)
                writer.writeheader()
                writer.writerows(kept_rows)
            print(f"  {filename}: removed {len(deleted)} rows -> {len(kept_rows)} remaining")
        print("\nNow run: python3 scripts/build_videos_json.py")


if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv
    if dry_run:
        print("(Pass --apply to write changes)\n")
    main(dry_run)
