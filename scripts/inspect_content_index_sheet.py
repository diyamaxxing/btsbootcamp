#!/usr/bin/env python3
"""
Read-only scoping pass over the externally-maintained "BTS Content Index" Google Sheet
(https://docs.google.com/spreadsheets/d/1BVG4gUFvl4Gt-DlEmm1IQLIga3zV1Xb55WMf0gygqF0)
to size up whether it's worth wiring into the video import pipeline.

Uses the public gviz endpoint (no API key / auth needed for a link-viewable sheet), NOT
the Sheets API v4 — gviz only returns cell text, not hyperlink URLs, so this can count
"how many rows have something in the YouTube column" but cannot extract video IDs to
de-dupe against data/raws/*.csv. That step needs Sheets API v4 access (blocked for the
existing YOUTUBE_API_KEY, which is restricted to YouTube Data API v3 only).

Usage:
    python3 scripts/inspect_content_index_sheet.py
"""

import json
import re
import urllib.request
import urllib.parse

SPREADSHEET_ID = "1BVG4gUFvl4Gt-DlEmm1IQLIga3zV1Xb55WMf0gygqF0"

# Only tabs verified (by inspecting gviz column headers) to share the exact
# Date / Title / YouTube / Weverse / Other layout. Excludes "Weverse Live",
# "Music Shows", "Series Compilation", "Performances" and "Directory", which
# each use a different column layout and need their own parsing later.
TABS = [
    "PreDebut", "2C4S", "O!RUL8,2?", "SLA", "D&W", "HYYH1", "HYYH2", "HYYH:YF",
    "WINGS", "YNWA", "LYS:H", "LYS:T", "LYS:A", "MOTS:P", "MOTS:7", "BE", "PROOF",
    "CHAPTER 2", "ARIRANG",
]

GVIZ_URL = "https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:json&sheet={sheet}"
JSON_PREFIX = re.compile(r"^\s*/\*O_o\*/\s*google\.visualization\.Query\.setResponse\((.*)\);\s*$", re.S)


def fetch_tab(sheet_name):
    url = GVIZ_URL.format(id=SPREADSHEET_ID, sheet=urllib.parse.quote(sheet_name))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    match = JSON_PREFIX.match(raw)
    if not match:
        raise RuntimeError(f"Unexpected gviz response shape for tab {sheet_name!r}")
    return json.loads(match.group(1))


def cell_text(cell):
    if cell is None:
        return None
    return cell.get("f") or cell.get("v")


def inspect_era_tab(sheet_name):
    """Era tabs share the Date/Title/YouTube/Weverse/Other/... layout seen in the ARIRANG tab."""
    payload = fetch_tab(sheet_name)
    rows = payload["table"]["rows"]
    total = 0
    with_youtube = 0
    sample_titles = []
    for row in rows:
        cells = row.get("c") or []
        title = cell_text(cells[2]) if len(cells) > 2 else None
        if not title:
            continue
        total += 1
        youtube_cell = cell_text(cells[3]) if len(cells) > 3 else None
        if youtube_cell:
            with_youtube += 1
            if len(sample_titles) < 3:
                sample_titles.append(title)
    return total, with_youtube, sample_titles


def main():
    grand_total = 0
    grand_youtube = 0
    print(f"{'Tab':<20} {'Rows':>7} {'w/ YouTube link':>16}")
    print("-" * 46)
    for tab in TABS:
        try:
            total, with_youtube, samples = inspect_era_tab(tab)
        except Exception as exc:
            print(f"{tab:<20} ERROR: {exc}")
            continue
        grand_total += total
        grand_youtube += with_youtube
        print(f"{tab:<20} {total:>7} {with_youtube:>16}")
    print("-" * 46)
    print(f"{'TOTAL':<20} {grand_total:>7} {grand_youtube:>16}")


if __name__ == "__main__":
    main()
