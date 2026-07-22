#!/usr/bin/env python3
"""
Reads real hyperlinks (not just cell text) out of the external "BTS Content Index"
Google Sheet via Sheets API v4, extracts YouTube video IDs from the YouTube column
of each consistent-layout era tab, and diffs them against every video ID already
present in data/raws/*.csv to find the actual net-new videos.

Read-only: uses spreadsheets.get, never writes to the sheet.

Usage:
    YOUTUBE_API_KEY=your_key python3 scripts/diff_content_index_sheet.py
"""

import csv
import json
import os
import re
import sys
import urllib.request
import urllib.parse
from pathlib import Path

API_KEY = os.environ.get("YOUTUBE_API_KEY")
if not API_KEY:
    raise SystemExit("Error: YOUTUBE_API_KEY environment variable not set.")

SPREADSHEET_ID = "1BVG4gUFvl4Gt-DlEmm1IQLIga3zV1Xb55WMf0gygqF0"

# Same consistent-layout subset as inspect_content_index_sheet.py.
TABS = [
    "PreDebut", "2C4S", "O!RUL8,2?", "SLA", "D&W", "HYYH1", "HYYH2", "HYYH:YF",
    "WINGS", "YNWA", "LYS:H", "LYS:T", "LYS:A", "MOTS:P", "MOTS:7", "BE", "PROOF",
    "CHAPTER 2", "ARIRANG",
]

RAWS_DIR = Path(__file__).parent.parent / "data" / "raws"
OUT_PATH = Path(os.environ.get("SHEET_DIFF_OUT", "/tmp/content_index_net_new.csv"))

YOUTUBE_ID_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)"
    r"([A-Za-z0-9_-]{11})"
)


def a1_quote_sheet_name(sheet_name):
    # A1 notation requires single-quoting any sheet name with special characters
    # (space, !, :, etc.), with embedded single quotes doubled. Without this,
    # names like "LYS:H" get parsed as a malformed multi-sheet range instead of
    # a literal sheet name, silently returning zero rows or a 400 error.
    escaped = sheet_name.replace("'", "''")
    return f"'{escaped}'"


def sheets_api_get(sheet_name):
    range_param = a1_quote_sheet_name(sheet_name)
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
        f"?ranges={urllib.parse.quote(range_param)}"
        f"&fields=sheets.data.rowData.values(formattedValue,hyperlink)"
        f"&key={API_KEY}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_video_id(url_str):
    if not url_str:
        return None
    match = YOUTUBE_ID_RE.search(url_str)
    return match.group(1) if match else None


def load_existing_ids():
    ids = set()
    for csv_path in RAWS_DIR.glob("*.csv"):
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                vid = extract_video_id(row.get("url", ""))
                if vid:
                    ids.add(vid)
    return ids


def rows_for_tab(sheet_name):
    payload = sheets_api_get(sheet_name)
    sheets = payload.get("sheets", [])
    if not sheets:
        return []
    row_data = sheets[0].get("data", [{}])[0].get("rowData", [])
    out = []
    for row in row_data:
        values = row.get("values", [])
        if len(values) <= 3:
            continue
        title_cell = values[2] if len(values) > 2 else {}
        youtube_cell = values[3] if len(values) > 3 else {}
        title = title_cell.get("formattedValue")
        if not title:
            continue
        link = youtube_cell.get("hyperlink") or extract_video_id_from_text(youtube_cell.get("formattedValue"))
        out.append((title, link))
    return out


def extract_video_id_from_text(_text):
    # formattedValue is just "HERE" — no URL in plain text. Kept as a no-op
    # placeholder so rows_for_tab has one place to extend if the sheet author
    # ever switches a cell to a raw pasted URL instead of a rich-text hyperlink.
    return None


def main():
    existing_ids = load_existing_ids()
    print(f"Existing videos with a recognizable YouTube ID in data/raws/*.csv: {len(existing_ids)}")

    net_new = []
    seen_in_sheet = set()
    print(f"\n{'Tab':<20} {'YT links':>9} {'Net new':>9}")
    print("-" * 40)
    for tab in TABS:
        try:
            rows = rows_for_tab(tab)
        except Exception as exc:
            print(f"{tab:<20} ERROR: {exc}", file=sys.stderr)
            continue
        tab_links = 0
        tab_new = 0
        for title, hyperlink in rows:
            vid = extract_video_id(hyperlink or "")
            if not vid:
                continue
            tab_links += 1
            seen_in_sheet.add(vid)
            if vid not in existing_ids:
                tab_new += 1
                net_new.append((tab, vid, title, hyperlink))
        print(f"{tab:<20} {tab_links:>9} {tab_new:>9}")

    print("-" * 40)
    print(f"Total YouTube links found in sheet: {len(seen_in_sheet)}")
    print(f"Net new (not already in data/raws/*.csv): {len(net_new)}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["era_tab", "youtube_id", "title", "url"])
        writer.writerows(net_new)
    print(f"\nWrote {len(net_new)} net-new rows to {OUT_PATH}")


if __name__ == "__main__":
    main()
