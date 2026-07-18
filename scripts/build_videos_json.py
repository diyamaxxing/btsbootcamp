#!/usr/bin/env python3
"""
Converts all CSVs in data/raws/ into data/videos.json.
Also auto-assigns era from data/eras.json based on air_date.
Run BTS is excluded from era assignment (era stays null).
Safe to re-run any time — always rebuilds from the CSVs.

Usage:
    python3 scripts/build_videos_json.py
"""

import csv
import json
from pathlib import Path

RAWS_DIR  = Path(__file__).parent.parent / "data" / "raws"
ERAS_FILE = Path(__file__).parent.parent / "data" / "eras.json"
OUT_FILE  = Path(__file__).parent.parent / "data" / "videos.json"

CSV_FILES = [
    "mvs.csv",
    "bangtan_bombs.csv",
    "dance_practices.csv",
    "run_bts.csv",
    "bts_episodes.csv",
]

# types excluded from era auto-assignment
ERA_EXEMPT_TYPES = {"Run BTS"}


def load_eras():
    """Load eras.json sorted by start date ascending."""
    eras = json.loads(ERAS_FILE.read_text())
    return sorted(eras, key=lambda e: e["start"])


def assign_era(air_date, eras):
    """
    Return the era name whose start date is <= air_date.
    Returns None if air_date is before the first era or missing.
    """
    if not air_date:
        return None
    matched = None
    for era in eras:
        if air_date >= era["start"]:
            matched = era["name"]
        else:
            break
    return matched


def coerce_row(row, eras):
    """Convert a CSV row (all strings) to the typed video record schema."""
    members_raw = row.get("members", "")
    members = [m.strip() for m in members_raw.split("|") if m.strip()] if members_raw else []

    subtitles_raw = row.get("subtitles", "").strip().lower()
    subtitles = True if subtitles_raw == "true" else (False if subtitles_raw == "false" else None)

    episode_raw = row.get("episode", "").strip()
    episode = int(episode_raw) if episode_raw.isdigit() else None

    duration_raw = row.get("duration_sec", "").strip()
    duration_sec = int(duration_raw) if duration_raw.isdigit() else None

    vid_type  = row.get("type", "").strip()
    air_date  = row.get("air_date", "").strip() or None

    # manual era in CSV takes precedence; otherwise auto-assign unless exempt
    manual_era = row.get("era", "").strip() or None
    if manual_era:
        era = manual_era
    elif vid_type in ERA_EXEMPT_TYPES:
        era = None
    else:
        era = assign_era(air_date, eras)

    view_raw = row.get("view_count", "").strip()
    like_raw = row.get("like_count", "").strip()

    return {
        "id":           row.get("id", "").strip(),
        "title":        row.get("title", "").strip(),
        "upload_date":  row.get("upload_date", "").strip() or None,
        "air_date":     air_date,
        "era":          era,
        "type":         vid_type,
        "series":       row.get("series", "").strip(),
        "episode":      episode,
        "url":          row.get("url", "").strip(),
        "thumbnail":    row.get("thumbnail", "").strip(),
        "members":      members,
        "subtitles":    subtitles,
        "duration_sec": duration_sec,
        "description":  row.get("description", "").strip() or None,
        "status":       row.get("status", "active").strip() or "active",
        "view_count":   int(view_raw) if view_raw.isdigit() else 0,
        "like_count":   int(like_raw) if like_raw.isdigit() else 0,
    }


def main():
    eras = load_eras()
    print(f"Loaded {len(eras)} eras from eras.json")

    videos = []
    for filename in CSV_FILES:
        csv_path = RAWS_DIR / filename
        if not csv_path.exists():
            print(f"  WARNING: {filename} not found, skipping.")
            continue
        with open(csv_path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        converted = [coerce_row(r, eras) for r in rows]
        videos.extend(converted)
        print(f"  {filename}: {len(converted)} records")

    # sort by air_date — undated entries go to the end
    videos.sort(key=lambda v: v["air_date"] or "9999-99-99")

    OUT_FILE.write_text(json.dumps(videos, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(videos)} records → {OUT_FILE}")

    # era assignment summary
    from collections import Counter
    era_counts = Counter(v["era"] for v in videos)
    print("\nEra distribution:")
    for era, count in sorted(era_counts.items(), key=lambda x: (x[0] is None, x[0])):
        print(f"  {era or '(none)'}: {count}")


if __name__ == "__main__":
    main()
