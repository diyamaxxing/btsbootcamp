# btsbootcamp

A fan-built, open-source BTS video hub — Netflix-browse meets TikTok-scroll. No backend, no database: content data (videos, eras) lives as flat JSON in this repo; user-generated data (profiles) lives in two sibling repos (`burnthestage`, `bestofbootcamp`) via a validate-then-promote pipeline, kept separate to isolate write-credential risk from the site's own code. See `CLAUDE.md` for architecture details, `ARCHITECTURE_DECISIONS.md` for the reasoning behind that split, and `BTSBootcamp-Requirements.md` for the full PRD.

## Running locally

This is a static site (vanilla HTML/CSS/JS, no build step). It needs to be served over HTTP rather than opened directly as a `file://` path, since the pages `fetch()` the JSON data files.

From the repo root:

```bash
python3 -m http.server 8000
```

Then open:

- Home: [http://localhost:8000/mainmuster.html](http://localhost:8000/mainmuster.html)
- Browse: [http://localhost:8000/pages/index.html](http://localhost:8000/pages/index.html)
- Player: [http://localhost:8000/pages/player.html?id=bomb-575](http://localhost:8000/pages/player.html?id=bomb-575)

Any static file server works (e.g. `npx serve`, VS Code's Live Server extension) — just make sure it's serving from the repo root so `data/`, `css/`, and `js/` paths resolve correctly.

## Data scripts

The `scripts/` folder has standalone Python scripts used to build/maintain `data/videos.json`. They require Python 3 and the `requests` package (`pip install requests`):

- `fetch_playlists.py` — pulls video metadata from the YouTube Data API v3 for all 5 source playlists
- `build_videos_json.py` — builds `data/videos.json` from the raw CSVs in `data/raws/`, auto-assigning eras
- `tag_members.py` — heuristic member tagger; run with `--apply` to write changes, omit to dry-run
- `enrich_csvs.py` — legacy backfill script, superseded by `fetch_playlists.py`

## Deployment

Hosted on GitHub Pages (free, public repo). Pushing to the repo redeploys the site — no manual build/deploy step. The write pipeline for user profiles runs separately via GitHub Actions in the `burnthestage` repo — see `ARCHITECTURE_DECISIONS.md`.
