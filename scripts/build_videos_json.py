#!/usr/bin/env python3
"""
Converts all CSVs in data/raws/ into data/videos.json.
Safe to re-run any time — always rebuilds from the CSVs.

Usage:
    python3 scripts/build_videos_json.py
"""

import csv
import json
from pathlib import Path

RAWS_DIR  = Path(__file__).parent.parent / "data" / "raws"
OUT_FILE  = Path(__file__).parent.parent / "data" / "videos.json"

CSV_FILES = [
    "mvs.csv",
    "bangtan_bombs.csv",
    "dance_practices.csv",
    "run_bts.csv",
]


def coerce_row(row):
    """Convert a CSV row (all strings) to the typed video record schema."""
    members_raw = row.get("members", "")
    members = [m.strip() for m in members_raw.split("|") if m.strip()] if members_raw else []

    subtitles_raw = row.get("subtitles", "").strip().lower()
    subtitles = True if subtitles_raw == "true" else (False if subtitles_raw == "false" else None)

    episode_raw = row.get("episode", "").strip()
    episode = int(episode_raw) if episode_raw.isdigit() else None

    duration_raw = row.get("duration_sec", "").strip()
    duration_sec = int(duration_raw) if duration_raw.isdigit() else None

    return {
        "id":           row.get("id", "").strip(),
        "title":        row.get("title", "").strip(),
        "upload_date":  row.get("upload_date", "").strip() or None,
        "air_date":     row.get("air_date", "").strip() or None,
        "era":          row.get("era", "").strip() or None,
        "type":         row.get("type", "").strip(),
        "series":       row.get("series", "").strip(),
        "episode":      episode,
        "url":          row.get("url", "").strip(),
        "thumbnail":    row.get("thumbnail", "").strip(),
        "members":      members,
        "subtitles":    subtitles,
        "duration_sec": duration_sec,
        "description":  row.get("description", "").strip() or None,
        "status":       row.get("status", "active").strip() or "active",
    }


def main():
    videos = []
    for filename in CSV_FILES:
        csv_path = RAWS_DIR / filename
        if not csv_path.exists():
            print(f"  WARNING: {filename} not found, skipping.")
            continue
        with open(csv_path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        converted = [coerce_row(r) for r in rows]
        videos.extend(converted)
        print(f"  {filename}: {len(converted)} records")

    # sort by air_date (true release order) — undated entries go to the end
    videos.sort(key=lambda v: v["air_date"] or "9999-99-99")

    OUT_FILE.write_text(json.dumps(videos, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(videos)} records → {OUT_FILE}")


if __name__ == "__main__":
    main()
