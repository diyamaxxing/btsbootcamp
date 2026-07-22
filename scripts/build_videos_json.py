#!/usr/bin/env python3
"""
Converts all CSVs in data/raws/ into public/data/videos.json.
Also auto-assigns era from public/data/eras.json based on air_date.
Run BTS is excluded from era assignment (era stays null).
Safe to re-run any time — always rebuilds from the CSVs.

Also computes two things automatically from title text (see ARCHITECTURE_DECISIONS.md
for the reasoning): cross-category tags and a shared "song" key for the recommender.

videos.json/eras.json live under public/data/ (not data/) since the Next.js
migration — they're fetched client-side at runtime from the static export,
same as before, just relocated so there's a single source-of-truth location
with no copy step needed in CI. See ARCHITECTURE_DECISIONS.md's
framework-migration entry.

Usage:
    python3 scripts/build_videos_json.py
"""

import csv
import json
import re
from pathlib import Path

RAWS_DIR  = Path(__file__).parent.parent / "data" / "raws"
ERAS_FILE = Path(__file__).parent.parent / "public" / "data" / "eras.json"
OUT_FILE  = Path(__file__).parent.parent / "public" / "data" / "videos.json"

CSV_FILES = [
    "mvs.csv",
    "bangtan_bombs.csv",
    "dance_practices.csv",
    "run_bts.csv",
    "bts_episodes.csv",
    "bts_on_air.csv",
    "content_index.csv",
]

# types excluded from era auto-assignment
ERA_EXEMPT_TYPES = {"Run BTS"}

# ── cross-category tagging ───────────────────────────────────────────────────
# Every category is checked against every video with EQUAL weight — there is no
# "primary" type. A video keeps its source-playlist `type`, but ALSO picks up a
# tag for any other category whose canonical title convention it structurally
# matches. Patterns below are derived from how each category's OWN playlist
# actually titles its videos (verified against the real CSVs), not a loose
# keyword list — e.g. plain "MV" appears in dozens of Bangtan Bomb titles
# ("MV Reaction", "MV Shooting") that are NOT music videos, so the pattern
# requires the full "Official MV" convention real MVs use, which correctly
# matches none of those. "Dance Practice" without the quoted-song-title prefix
# would over-match casual bomb titles like "Attack on BTS at dance practice" —
# the quoted-title requirement is what excludes those.
CATEGORY_PATTERNS = {
    "Dance Practice": re.compile(r"['\"‘’][^'\"‘’]+['\"‘’]\s*Dance Practice(?:\s*\([^)]*\))?\s*(?:-\s*BTS.*)?$", re.IGNORECASE),
    "MV":             re.compile(r"['\"‘’][^'\"‘’]+['\"‘’]\s*Official MV", re.IGNORECASE),
    # Added for the "BTS On Air" playlist (mixed fancams/broadcast/talk-show
    # appearances, no single clean type) — derived from scripts/word_frequency.py
    # run against the real titles, not guessed. "FanCam"/"FaceCam"/"FullCam" all
    # show up as one compound word in the actual titles (e.g. "(Jimin FaceCam)"),
    # so no separate whitespace-tolerant variant is needed.
    "Fancam":         re.compile(r"\b(?:fan|face|full)cam\b", re.IGNORECASE),
    # Korean broadcast music shows — matches both the English handle (@MCOUNTDOWN,
    # Music Bank, Inkigayo) and the Korean show name, since titles use either.
    "Music Show":     re.compile(r"mcountdown|music\s*bank|inkigayo|인기가요|엠카운트다운|뮤직뱅크", re.IGNORECASE),
    "Talk Show":      re.compile(r"tonight\s+show|jimmy\s+fallon", re.IGNORECASE),
    # Excludes "V Live" (the old Naver livestreaming app, unrelated to a live
    # performance) and "Can't Live Without" (GQ-style listicle title), the two
    # false-positive shapes found when checking this against every real title.
    "Live Performance": re.compile(r"(?<!v )\blive\b(?!\s+without)", re.IGNORECASE),
    # Added for "content_index.csv" (the externally-maintained BTS Content Index
    # sheet import — see ARCHITECTURE_DECISIONS.md) — derived from a
    # word-frequency pass over its real titles, same process as the On Air
    # additions above. "Countdown" specifically excludes the "M Countdown" /
    # "M!Countdown" broadcast show name (already covered by "Music Show"
    # above), which is by far the most common false-positive shape.
    "Interview":         re.compile(r"\binterview\b", re.IGNORECASE),
    "Behind the Scenes": re.compile(r"\bbehind\b", re.IGNORECASE),
    "Log":               re.compile(r"\blog\b", re.IGNORECASE),
    "Teaser":            re.compile(r"\bteaser\b", re.IGNORECASE),
    "Trailer":           re.compile(r"\btrailer\b", re.IGNORECASE),
    "Preview":           re.compile(r"\bpreview\b", re.IGNORECASE),
    "Countdown":         re.compile(r"(?<!m[ !-])\bcountdown\b", re.IGNORECASE),
}

# ── song/release extraction (for the recommender, not for tags) ─────────────
# Pulls the quoted title substring out of a video's title, e.g. "Butter" out of
# "BTS 'Butter' Official MV" or "[BANGTAN BOMB] 'Butter' Album Unboxing". Used
# to link videos about the SAME release across every category — an MV, its
# dance practice, and a bomb about its jacket shoot all share song="butter"
# even though their types are completely different. This is deliberately
# separate from the category tags above: shared song is a recommendation
# signal (see pages/player.html), not a content-type classification.
# Known limitation: a song name containing its own apostrophe (e.g. "Killin'
# It Girl") can truncate the match early if the title uses single quotes as
# its delimiter — accepted for now since a missed link just means one fewer
# recommendation, not incorrect data.
SONG_PATTERN = re.compile(r"['\"‘’]([^'\"‘’]{2,40})['\"‘’]")


def extract_song(title):
    # Not lowercased — official song titles are capitalized consistently
    # across every playlist in the real data (verified: grouping coverage is
    # identical with or without normalization), so keeping original case
    # gives cleaner display (e.g. "Butter") for free.
    match = SONG_PATTERN.search(title)
    return match.group(1).strip() if match else None


def compute_tags(title, vid_type, extra_tags_raw=""):
    """
    Cross-category tags: every OTHER category whose pattern this title matches,
    plus any manually-recorded extra_tags from the CSV (pipe-delimited, same
    convention as `members`). extra_tags exists for the one case pattern-matching
    genuinely can't recover: the same video legitimately listed under two
    different official playlists (e.g. a Bangtan Bomb also in the Dance Practice
    playlist) with no textual marker in the title distinguishing that fact — see
    scripts/collapse_duplicate_videos.py and ARCHITECTURE_DECISIONS.md. Every
    other tag stays fully computed; this is not a general hand-tagging escape
    hatch.
    """
    tags = []
    for category, pattern in CATEGORY_PATTERNS.items():
        if category == vid_type:
            continue  # not a "tag" if it's already the video's own type
        if pattern.search(title):
            tags.append(category)
    for extra in extra_tags_raw.split("|"):
        extra = extra.strip()
        if extra and extra != vid_type and extra not in tags:
            tags.append(extra)
    return tags


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
    title     = row.get("title", "").strip()

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
        "title":        title,
        "upload_date":  row.get("upload_date", "").strip() or None,
        "air_date":     air_date,
        "era":          era,
        "type":         vid_type,
        "series":       row.get("series", "").strip(),
        "episode":      episode,
        "url":          row.get("url", "").strip(),
        "thumbnail":    row.get("thumbnail", "").strip(),
        "members":      members,
        "tags":         compute_tags(title, vid_type, row.get("extra_tags", "")),
        "song":         extract_song(title),
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

    # cross-tag summary
    tagged = [v for v in videos if v["tags"]]
    print(f"\nCross-tagged videos: {len(tagged)}")
    for v in tagged:
        print(f"  {v['id']} ({v['type']}) -> {v['tags']}: {v['title']}")

    # song grouping summary
    songs = Counter(v["song"] for v in videos if v["song"])
    linked_songs = {s: c for s, c in songs.items() if c >= 2}
    print(f"\nSongs linking 2+ videos across the catalog: {len(linked_songs)}")


if __name__ == "__main__":
    main()
