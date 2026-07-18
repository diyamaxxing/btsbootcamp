#!/usr/bin/env python3
"""
Enriches CSVs in data/raws/ with upload_date and duration_sec from the YouTube Data API.
Reads YOUTUBE_API_KEY from environment.

Note: fetch_playlists.py is the canonical source and populates these fields on full runs.
Use this script only to backfill gaps without re-fetching entire playlists.

Usage:
    YOUTUBE_API_KEY=your_key python3 scripts/enrich_csvs.py
"""

import csv
import json
import os
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path

API_KEY = os.environ.get("YOUTUBE_API_KEY")
if not API_KEY:
    raise SystemExit("Error: YOUTUBE_API_KEY environment variable not set.")

RAWS_DIR = Path(__file__).parent.parent / "data" / "raws"
API_URL = "https://www.googleapis.com/youtube/v3/videos"
BATCH_SIZE = 50  # YouTube API max per request


def extract_video_id(url):
    match = re.search(r"v=([a-zA-Z0-9_-]{11})", url)
    return match.group(1) if match else None


def iso8601_duration_to_sec(duration):
    """Convert PT1H2M3S → seconds."""
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return ""
    h = int(match.group(1) or 0)
    m = int(match.group(2) or 0)
    s = int(match.group(3) or 0)
    return h * 3600 + m * 60 + s


def fetch_video_details(video_ids):
    """Fetch snippet + contentDetails for up to 50 video IDs."""
    params = urllib.parse.urlencode({
        "part": "snippet,contentDetails",
        "id": ",".join(video_ids),
        "key": API_KEY,
    })
    url = f"{API_URL}?{params}"
    with urllib.request.urlopen(url) as resp:
        data = json.loads(resp.read())
    result = {}
    for item in data.get("items", []):
        vid_id = item["id"]
        published = item["snippet"]["publishedAt"][:10]  # YYYY-MM-DD
        duration = iso8601_duration_to_sec(item["contentDetails"]["duration"])
        result[vid_id] = {"upload_date": published, "duration_sec": duration}
    return result


def enrich_csv(csv_path):
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # collect video IDs that still need enrichment
    to_fetch = []
    for row in rows:
        if not row.get("upload_date") or not row.get("duration_sec"):
            vid_id = extract_video_id(row.get("url", ""))
            if vid_id:
                to_fetch.append(vid_id)

    if not to_fetch:
        print(f"  {csv_path.name}: already fully enriched, skipping.")
        return

    # batch fetch
    details = {}
    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch = to_fetch[i:i + BATCH_SIZE]
        print(f"  Fetching batch {i // BATCH_SIZE + 1} ({len(batch)} videos)...")
        details.update(fetch_video_details(batch))
        time.sleep(0.2)  # stay well under quota

    # write back
    enriched = 0
    for row in rows:
        vid_id = extract_video_id(row.get("url", ""))
        if vid_id and vid_id in details:
            if not row.get("upload_date"):
                row["upload_date"] = details[vid_id]["upload_date"]
            if not row.get("duration_sec"):
                row["duration_sec"] = details[vid_id]["duration_sec"]
            enriched += 1

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  {csv_path.name}: enriched {enriched}/{len(rows)} rows.")


def main():
    csv_files = sorted(RAWS_DIR.glob("*.csv"))
    if not csv_files:
        raise SystemExit(f"No CSVs found in {RAWS_DIR}")
    for csv_path in csv_files:
        print(f"Processing {csv_path.name}...")
        enrich_csv(csv_path)
    print("\nDone. Re-run any time to fill gaps.")


if __name__ == "__main__":
    main()
