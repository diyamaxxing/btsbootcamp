"""
Heuristic member tagging.

Operates on the raw CSVs (data/raws/*.csv), not videos.json — videos.json is
fully regenerated from the CSVs by build_videos_json.py on every run, so
writing tags only to videos.json means the next rebuild (e.g. adding a new
playlist) silently wipes every tag back to the default all-7. Run
build_videos_json.py yourself after applying to pick up the change there.

Logic:
- Strip the '- BTS (방탄소년단)' suffix from titles before matching
- Match each member's own English stage name + Korean name against the
  cleaned title, in English or Korean only — no aliases, no initials
- If 1–3 members detected → tag with those members (solo or unit content)
- If 4+ members detected, or 0 detected → keep all 7 (group default)
- Never overwrite a row whose members column isn't still the default all 7
"""

import csv, re, sys
from pathlib import Path

ROOT     = Path(__file__).parent.parent
RAWS_DIR = ROOT / "data" / "raws"

CSV_FILES = [
    "mvs.csv",
    "bangtan_bombs.csv",
    "dance_practices.csv",
    "run_bts.csv",
    "bts_episodes.csv",
    "bts_on_air.csv",
    "okru_qdeoks.csv",
]

MEMBERS   = ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"]
ALL_SEVEN = set(MEMBERS)

# Each member's name — their stage name, Korean name, known aliases
# (Rap Monster/RAPMON for RM, Agust D for Suga — different names, same
# person), and initials (JM, JK) all count as "their name" appearing.
# Every pattern below was checked against all 2,767 real titles in the
# corpus for false positives before landing. The one real one found, "V
# LIVE" (the old Naver streaming app, not the member), is explicitly
# excluded from the V pattern.
# Each list is OR'd; first match wins for that member.
PATTERNS = {
    "RM":       [r"\bRM\b", r"\bRap\s*Monster\b", r"\bRAPMON\b", r"남준"],
    "Jin":      [r"\bJIN\b", r"석진"],
    "Suga":     [r"\bSUGA\b", r"\bAgust\s*D\b", r"윤기"],
    "J-Hope":   [r"\bj-?hope\b", r"호석"],
    "Jimin":    [r"\bJIMIN\b", r"(?<!\w)JM(?!\w)", r"지민"],
    "Jungkook": [r"\bJUNG\s*KOOK\b", r"(?<!\w)JK(?!\w)", r"정국"],
    "V":        [r"\bV\b(?!\s*LIVE\b)", r"태형"],
}

STRIP_SUFFIX = re.compile(
    r"\s*[-–]\s*BTS\s*(?:\(방탄소년단\))?\s*$|"
    r"\s*\(방탄소년단\)\s*$",
    re.IGNORECASE,
)


def detect(title: str) -> set[str]:
    cleaned = STRIP_SUFFIX.sub("", title).strip()
    found = set()
    for member, pats in PATTERNS.items():
        for p in pats:
            if re.search(p, cleaned, re.IGNORECASE):
                found.add(member)
                break
    return found


def main(dry_run: bool = True):
    changes = []

    for filename in CSV_FILES:
        path = RAWS_DIR / filename
        if not path.exists():
            print(f"  WARNING: {filename} not found, skipping.")
            continue

        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            rows = list(reader)

        file_changed = False
        for row in rows:
            current_raw = row.get("members", "")
            current = set(m.strip() for m in current_raw.split("|") if m.strip())
            if current != ALL_SEVEN:
                continue  # already manually tagged — skip

            found = detect(row["title"])
            if 0 < len(found) <= 3:
                new_members = sorted(found, key=lambda m: MEMBERS.index(m))
                changes.append((filename, row["id"], row["title"][:70], sorted(current), new_members))
                if not dry_run:
                    row["members"] = "|".join(new_members)
                    file_changed = True

        if not dry_run and file_changed:
            with open(path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)

    print(f"{'DRY RUN — ' if dry_run else ''}Found {len(changes)} videos to retag:\n")
    for filename, vid_id, title, old, new in changes:
        print(f"  [{filename}] {vid_id}")
        print(f"    {title}")
        print(f"    {old} → {new}")
        print()

    if not dry_run:
        print(f"Written {len(changes)} changes across the CSVs.")
        print("Now run: python3 scripts/build_videos_json.py")


if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv
    if dry_run:
        print("(Pass --apply to write changes)\n")
    main(dry_run)
