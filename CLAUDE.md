# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nabati R&D Command Center: an intranet tracker for product-development projects and Opex savings initiatives, hosted on an office PC and handed to corporate IT as a zip.

Hard constraints:

- **Running it needs only Python.** `server.py` is standard library only (no pip packages). The built interface in `dist/` ships in the zip.
- **Nothing is loaded from other hosts at run time**: no CDN, no web fonts, no analytics. Every script and style is bundled into `dist/assets/`.
- **Node is a build-time tool only**, for the React interface in `web/`. Keep its dependency list short (React, three + @react-three/fiber, @shadergradient/react with three-stdlib and camera-controls, motion, @lucasmarkes/hairline, Vite). Do not add a router, state library, CSS framework or UI kit. `three` is pinned to 0.169: ShaderGradient breaks on newer releases (a shader chunk it includes was removed), so do not bump it without checking the background in the preview.

`README.md` is the IT deployment guide and must stay accurate when behaviour changes.

## Commands

```bash
python server.py                                  # run on http://localhost:8080/
python -m unittest test_server -v                 # all tests (temp DB, never touches rnd.db)
python -m unittest test_server.T.test_08_roundtrip    # one test
powershell -File build.ps1                        # rebuild web/ into dist/
```

Settings are environment variables: `PORT`, `HOST`, `RND_DB`, `RND_EDIT_KEY`, `RND_SEED` (see README). For browser preview use the `rnd-command-center` entry in `.claude/launch.json`; it runs on port 8765 with a throwaway database in the temp folder so the project folder never gets an `rnd.db`. The preview serves `dist/`, so run `build.ps1` after changing `web/`.

The project folder is inside OneDrive:

- Never leave an `rnd.db` here (SQLite WAL and file sync do not mix) and never put one in the zip.
- Never run `npm install` here. `build.ps1` copies `web/` to `%LOCALAPPDATA%\rnd-cc-build`, builds there and copies `dist/` back, so `node_modules` stays out of OneDrive.

The folder is a git repository pushed to `github.com/opexcommit/RnD-Command-Center`, which is PUBLIC. Databases, `node_modules`, the hand-over zips and `seed.csv` (real project names) are ignored and must never be committed; `dist/` is tracked. Commits use the GitHub no-reply identity set in the repo config. `nabati-rnd-command-center-v1.zip` is the last single-file, dependency-free version and predates the repository.

## Architecture

`server.py` and the interface are coupled only through the JSON API listed at the bottom of `README.md`. Change both sides together.

**server.py**
- `make_server(db_path, host, port, edit_key, seed_csv)` builds the server; tests start it on port 0. `Handler.dispatch` is the single entry point for every method: static files first, then the route check, the POST content-type gate, the edit-key check, then one SQLite connection per request.
- `TYPES`, `STATUSES`, `STAGES` are the vocabulary. Type `Opex` uses the `opex` stage list, every other type uses `npd`. The frontend reads these from `GET /api/projects`; it has no copy of its own.
- `validate()` is the one validation path for create, update, CSV import and the seed file. `EDIT` is the list of client-editable columns and also the CSV column order.
- Optimistic concurrency: `PUT` must carry the `version` it read; the `UPDATE ... WHERE id=? AND version=?` returning 0 rows becomes a 409 with the current row.
- First start is guarded by `PRAGMA user_version`: a new database is filled once, from `seed_csv` through `import_csv` if that file exists, otherwise with invented demo rows (`seed()`, dates relative to today). Clearing rows must never cause a re-seed.
- Security decisions that look odd but are deliberate:
  - POST requires `application/json` or `text/csv` (415 otherwise). This is the CSRF defence when no edit key is set; do not relax it.
  - Only `dist/index.html` and files that appear in the listing of `dist/assets/` are served. The requested name is compared with the folder listing; no path is ever built from the URL.
  - CSV export prefixes `'` to text cells starting with `= + - @` (formula injection) and import strips it again so export -> import round-trips.
  - `log_message` is silenced but `log_error` writes to stderr; keep 500s visible.

**web/ (React, plain JSX, built by Vite into dist/)**
- `App.jsx` owns the data and `load()`, which polls every 15 s. `load()` skips the state update when the payload is unchanged or a card is being dragged. Every write calls `load(true)` afterwards instead of patching local state.
- `lib.js` holds the API helper and formatters; `Dashboard`, `Pipeline`, `Projects`, `DataTab`, `ProjectDialog` are the four screens and the edit dialog.
- User data is rendered only as React text. Never use `dangerouslySetInnerHTML`.
- Status is encoded by shape plus label, never colour alone (`StatusIcon.jsx`).
- The load animation (`.intro` class) and count-up play once per page load and are disabled under `prefers-reduced-motion`.
- Step folders: `Folders3D.jsx` is one transparent r3f canvas (orthographic, 1 unit = 1 CSS pixel) drawn behind real buttons in `Track` (`Dashboard.jsx`). It is lazy-loaded behind `Boundary`; without WebGL the CSS folder shapes on `.fbtn` show. The lid is a Motion spring read in `useFrame`. `Ribbon` drifts chips with a transform and hands the offset to real scrolling while hovered or focused; it does not run under `prefers-reduced-motion`. Never animate `scrollLeft` (or anything else that fires scroll events) every frame: react-three-fiber measures a canvas only after scroll events stop, so the 3D parts would never start.
- `OPEX` in `lib.js` is `false`: the interface hides the Opex track, pipeline toggle, type choice and savings figures, and `App.jsx` drops Opex rows after loading. The server still supports Opex; flip the constant and rebuild to bring it back.
- Visual rules (`styles.css`):
  - Pastel tokens live in `:root`. Brand red `#ED1B24` appears only on the "Nabati" badge. Text uses the ink tokens; pastel colours are for surfaces, never for text. Text tokens must keep 4.5:1 contrast and status marks 3:1.
  - "Glass" is plain CSS (`.glass`: translucent white + `backdrop-filter`), on large containers only. Never put `backdrop-filter` on repeated items such as cards or rows.
  - `Backdrop.jsx` (ShaderGradient on react-three-fiber) is decoration: lazy-loaded, behind an error boundary, still under reduced motion. The page must work without WebGL. Keep lightType="3d": "env" downloads HDR files from github.io.
  - `Figure.jsx` wraps a hairline figure. Hairline plates are opaque, so a figure sits on a solid `--tile` background, never directly on glass.
  - Do not add anything that needs HTTPS or WebGPU: the app is served over plain http on the intranet.

## Data rules

- `seed.csv` holds **real project names** exported from the R&D tracker by `tools/export_tracker.py` (code, name, group, status and last-update date only). `tools/` is a local helper and is not shipped in the zip.
- Never copy the tracker's free-text notes, real formulas, material codes or anything from `..\Scale Up Formula\masking_key.csv` into this project. The demo rows in `seed()` are invented and must stay invented.
