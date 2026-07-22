#!/usr/bin/env python3
"""
Backfills full YouTube metadata (upload_date, duration_sec, view/like counts,
status) for the net-new video IDs found by diff_content_index_sheet.py.

This is a STAGING step, not a merge into data/raws/*.csv: it deliberately
leaves type/era/members/tags unset. Those are a classification decision that
needs a word_frequency.py pass over the real titles pulled here first — this
batch is far more heterogeneous (pre-debut solo tracks, brand interviews,
one-off campaigns) than any single known playlist, so guessing `type` before
looking at real title patterns would risk the same silent-misclassification
mistake tag_members.py already had to fix once (see CLAUDE.md).

Usage:
    YOUTUBE_API_KEY=your_key python3 scripts/fetch_content_index_metadata.py \
        [--in path/to/content_index_net_new.csv] [--out path/to/staging.csv]
"""

import argparse
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

DEFAULT_IN = Path("/tmp/content_index_net_new.csv")
DEFAULT_OUT = Path("/tmp/content_index_staged_metadata.csv")

FIELDS = [
    "era_tab", "youtube_id", "sheet_title", "youtube_title", "upload_date",
    "duration_sec", "status", "view_count", "like_count", "thumbnail", "url",
]


def api_get(endpoint, params):
    params["key"] = API_KEY
    url = f"https://www.googleapis.com/youtube/v3/{endpoint}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def iso8601_to_sec(duration):
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return ""
    h = int(match.group(1) or 0)
    m = int(match.group(2) or 0)
    s = int(match.group(3) or 0)
    return h * 3600 + m * 60 + s


def make_thumbnail(video_id):
    return f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"


def fetch_video_details(video_ids):
    details = {}
    total_batches = (len(video_ids) + 49) // 50
    for batch_num, i in enumerate(range(0, len(video_ids), 50), 1):
        batch = video_ids[i:i + 50]
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} IDs)...")
        data = api_get("videos", {
            "part": "snippet,contentDetails,statistics",
            "id":   ",".join(batch),
        })
        for item in data.get("items", []):
            vid_id      = item["id"]
            snippet     = item["snippet"]
            upload_date = snippet["publishedAt"][:10]
            duration    = iso8601_to_sec(item["contentDetails"]["duration"])
            title       = snippet.get("title", "")
            status      = "private" if title == "Private video" else "active"
            stats       = item.get("statistics", {})
            details[vid_id] = {
                "youtube_title": title,
                "upload_date":   upload_date,
                "duration_sec":  duration,
                "status":        status,
                "view_count":    int(stats.get("viewCount", 0) or 0),
                "like_count":    int(stats.get("likeCount", 0) or 0),
            }
        time.sleep(0.1)
    return details


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="in_path", type=Path, default=DEFAULT_IN)
    parser.add_argument("--out", dest="out_path", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    with open(args.in_path, newline="", encoding="utf-8") as f:
        rows_in = list(csv.DictReader(f))
    print(f"Loaded {len(rows_in)} net-new rows from {args.in_path}")

    video_ids = [r["youtube_id"] for r in rows_in]
    details = fetch_video_details(video_ids)
    print(f"Fetched details for {len(details)}/{len(video_ids)} IDs "
          f"({len(video_ids) - len(details)} not returned by the API — "
          f"likely deleted/private-and-inaccessible videos)")

    out_rows = []
    for r in rows_in:
        vid_id = r["youtube_id"]
        detail = details.get(vid_id)
        if not detail:
            continue  # dropped: API returned nothing for this ID
        out_rows.append({
            "era_tab":        r["era_tab"],
            "youtube_id":     vid_id,
            "sheet_title":    r["title"],
            "youtube_title":  detail["youtube_title"],
            "upload_date":    detail["upload_date"],
            "duration_sec":   detail["duration_sec"],
            "status":         detail["status"],
            "view_count":     detail["view_count"],
            "like_count":     detail["like_count"],
            "thumbnail":      make_thumbnail(vid_id),
            "url":            r["url"],
        })

    args.out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"\nWrote {len(out_rows)} staged rows → {args.out_path}")
    print("Note: type/era/members/tags are NOT set yet — that's the next step, "
          "after running word_frequency.py against youtube_title to find real patterns.")


if __name__ == "__main__":
    main()
