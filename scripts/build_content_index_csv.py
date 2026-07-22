#!/usr/bin/env python3
"""
Converts the staged output of fetch_content_index_metadata.py into
data/raws/content_index.csv, in the same schema every other raw CSV uses.

All rows get type="Archive" — this content comes from a heterogeneous,
externally-maintained sheet (interviews, pre-debut solo tracks, brand
campaigns, broadcast cuts...), not one single official playlist, the same
situation "BTS On Air" was in. Real classification lives in `tags`
(computed by build_videos_json.py's CATEGORY_PATTERNS — see the Interview/
Behind the Scenes/Log/Teaser/Trailer/Preview/Countdown additions there,
derived from a word_frequency.py-style pass over these exact titles), not in
`type`. era is left blank so build_videos_json.py auto-assigns it from the
real upload_date; members default to all 7 so tag_members.py can retag
solo/unit content the normal way.

Deduplicates by YouTube ID — the source sheet lists the same video under
multiple era tabs when a video ties two comeback eras together (rare but
real), and the schema only has room for one row per video.

Usage:
    python3 scripts/build_content_index_csv.py \
        [--in path/to/content_index_staged_metadata.csv] \
        [--out data/raws/content_index.csv]
"""

import argparse
import csv
from pathlib import Path

FIELDS = ["id", "title", "upload_date", "air_date", "era", "type", "series", "episode", "url", "thumbnail", "members", "subtitles", "duration_sec", "description", "status", "view_count", "like_count"]

DEFAULT_IN = Path("/tmp/content_index_staged_metadata.csv")
DEFAULT_OUT = Path(__file__).parent.parent / "data" / "raws" / "content_index.csv"

ALL_SEVEN = "RM|Jin|Suga|J-Hope|Jimin|V|Jungkook"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="in_path", type=Path, default=DEFAULT_IN)
    parser.add_argument("--out", dest="out_path", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    with open(args.in_path, newline="", encoding="utf-8") as f:
        staged = list(csv.DictReader(f))

    seen_ids = set()
    rows = []
    for r in staged:
        vid_id = r["youtube_id"]
        if vid_id in seen_ids:
            continue  # same video listed under more than one era tab
        seen_ids.add(vid_id)
        rows.append({
            "id":           f"index-{str(len(rows) + 1).zfill(5)}",
            "title":        r["youtube_title"],
            "upload_date":  r["upload_date"],
            "air_date":     r["upload_date"],
            "era":          "",
            "type":         "Archive",
            "series":       "BTS Content Index",
            "episode":      "",
            "url":          r["url"],
            "thumbnail":    r["thumbnail"],
            "members":      ALL_SEVEN,
            "subtitles":    "",
            "duration_sec": r["duration_sec"],
            "description":  "",
            "status":       r["status"],
            "view_count":   r["view_count"],
            "like_count":   r["like_count"],
        })

    args.out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Deduplicated {len(staged)} staged rows -> {len(rows)} unique videos")
    print(f"Written {len(rows)} rows -> {args.out_path}")
    print("Next: python3 scripts/tag_members.py --apply, then python3 scripts/build_videos_json.py")


if __name__ == "__main__":
    main()
