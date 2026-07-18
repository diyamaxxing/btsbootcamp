#!/usr/bin/env python3
"""
Fetches ALL videos from YouTube playlists via the YouTube Data API v3.
Overwrites CSVs in data/raws/ with complete data.

Schema has two date fields:
  upload_date — the YouTube publish date (what the API returns)
  air_date    — the true original air date. For most content = upload_date.
                For Run BTS pre-2022 (bulk-uploaded 2022-12-24 from V Live),
                air_date is derived from the year in the episode title.

Usage:
    YOUTUBE_API_KEY=your_key python3 scripts/fetch_playlists.py
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
FIELDS = ["id", "title", "upload_date", "air_date", "era", "type", "series", "episode", "url", "thumbnail", "members", "subtitles", "duration_sec", "description", "status"]

BULK_UPLOAD_DATE = "2022-12-24"  # date BTS batch-uploaded old V Live content to YouTube

PLAYLISTS = [
    {
        "playlist_id": "PL_Cqw69_m_yz4JcOfmZb2IDWwIuej1xfN",
        "type":        "MV",
        "series":      "MVs",
        "id_prefix":   "mv",
        "out_file":    "mvs.csv",
    },
    {
        "playlist_id": "PL5hrGMysD_Gu2a7-KuaQTxjRVPqM2Bi63",
        "type":        "Bangtan Bomb",
        "series":      "Bangtan Bombs",
        "id_prefix":   "bomb",
        "out_file":    "bangtan_bombs.csv",
    },
    {
        "playlist_id": "PL5hrGMysD_GusQlLU7C06Vyklhw_HjFra",
        "type":        "Dance Practice",
        "series":      "Dance Practices",
        "id_prefix":   "dance",
        "out_file":    "dance_practices.csv",
    },
    {
        "playlist_id": "PL5hrGMysD_GsFYwSFDWDyUApfpHEwTDhE",
        "type":        "Run BTS",
        "series":      "Run BTS",
        "id_prefix":   "run-bts",
        "out_file":    "run_bts.csv",
    },
    {
        "playlist_id": "PL5hrGMysD_Gt2ekpVt25B6C5ozZjVxQdh",
        "type":        "BTS Episode",
        "series":      "BTS Episode",
        "id_prefix":   "episode",
        "out_file":    "bts_episodes.csv",
    },
]


def api_get(endpoint, params):
    params["key"] = API_KEY
    url = f"https://www.googleapis.com/youtube/v3/{endpoint}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def fetch_all_playlist_items(playlist_id):
    """Page through playlistItems until nextPageToken is gone."""
    items = []
    params = {
        "part":       "snippet",
        "playlistId": playlist_id,
        "maxResults": 50,
    }
    page = 1
    while True:
        print(f"    Page {page} ({len(items)} so far)...")
        data = api_get("playlistItems", params)
        for item in data.get("items", []):
            snippet = item["snippet"]
            resource = snippet.get("resourceId", {})
            if resource.get("kind") != "youtube#video":
                continue
            items.append({
                "video_id": resource["videoId"],
                "title":    snippet.get("title", ""),
                "position": snippet.get("position", 0),
            })
        next_token = data.get("nextPageToken")
        if not next_token:
            break
        params["pageToken"] = next_token
        page += 1
        time.sleep(0.1)
    return items


def fetch_video_details(video_ids):
    """Fetch publishedAt + duration for up to 50 IDs at a time."""
    details = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        data = api_get("videos", {
            "part": "snippet,contentDetails",
            "id":   ",".join(batch),
        })
        for item in data.get("items", []):
            vid_id      = item["id"]
            upload_date = item["snippet"]["publishedAt"][:10]
            duration    = iso8601_to_sec(item["contentDetails"]["duration"])
            title       = item["snippet"].get("title", "")
            status      = "private" if title == "Private video" else "active"
            details[vid_id] = {
                "upload_date": upload_date,
                "duration_sec": duration,
                "status": status,
            }
        time.sleep(0.1)
    return details


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


def parse_run_bts_episode(title):
    """Extract episode number from 'Run BTS! YYYY EP.N - ...' titles. Returns int or None."""
    match = re.search(r"\bEP\.(\d+)\b", title, re.IGNORECASE)
    return int(match.group(1)) if match else None


def derive_air_date(title, upload_date, is_run_bts):
    """
    For Run BTS bulk-uploaded on BULK_UPLOAD_DATE, use the year in the title
    as the air_date (YYYY-01-01). For everything else, air_date = upload_date.
    """
    if not is_run_bts or upload_date != BULK_UPLOAD_DATE:
        return upload_date
    year_match = re.search(r"\b(20\d{2})\b", title)
    if year_match:
        return f"{year_match.group(1)}-01-01"
    return upload_date  # fallback


def process_playlist(pl):
    print(f"\n{pl['out_file']} — fetching playlist items...")
    items = fetch_all_playlist_items(pl["playlist_id"])
    print(f"  {len(items)} videos found. Fetching details...")

    video_ids = [it["video_id"] for it in items]
    details   = fetch_video_details(video_ids)

    out_path = RAWS_DIR / pl["out_file"]
    # preserve manually-filled fields from existing CSV
    existing = {}
    if out_path.exists():
        with open(out_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                vid_id = row.get("url", "").split("v=")[-1]
                existing[vid_id] = {
                    "era":         row.get("era", ""),
                    "members":     row.get("members", "RM|Jin|Suga|J-Hope|Jimin|V|Jungkook"),
                    "subtitles":   row.get("subtitles", ""),
                    "description": row.get("description", ""),
                }

    rows = []
    is_run_bts = pl["type"] == "Run BTS"
    for idx, it in enumerate(items, 1):
        vid_id      = it["video_id"]
        title       = it["title"]
        prev        = existing.get(vid_id, {})
        detail      = details.get(vid_id, {})
        upload_date = detail.get("upload_date", "")
        air_date    = derive_air_date(title, upload_date, is_run_bts)
        episode     = parse_run_bts_episode(title) if is_run_bts else None
        status      = detail.get("status", "active")

        rows.append({
            "id":           f"{pl['id_prefix']}-{str(idx).zfill(3)}",
            "title":        title,
            "upload_date":  upload_date,
            "air_date":     air_date,
            "era":          prev.get("era", ""),
            "type":         pl["type"],
            "series":       pl["series"],
            "episode":      episode if episode is not None else "",
            "url":          f"https://www.youtube.com/watch?v={vid_id}",
            "thumbnail":    make_thumbnail(vid_id),
            "members":      prev.get("members", "RM|Jin|Suga|J-Hope|Jimin|V|Jungkook"),
            "subtitles":    prev.get("subtitles", ""),
            "duration_sec": detail.get("duration_sec", ""),
            "description":  prev.get("description", ""),
            "status":       status,
        })

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Written {len(rows)} rows → {out_path}")


def main():
    RAWS_DIR.mkdir(parents=True, exist_ok=True)
    for pl in PLAYLISTS:
        process_playlist(pl)
    print("\nAll playlists complete.")


if __name__ == "__main__":
    main()
