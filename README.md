# Nabati R&D Command Center

One page for the R&D team to see where every product-development project and Opex savings initiative stands: a stage-gate overview, a drag-and-drop pipeline board, a searchable project list, and CSV import/export. Everyone who opens the page sees the same live data. Opex views are switched off in this build (OPEX in web/src/lib.js); the server and CSV still accept Opex rows.

To run it you need only Python. The user interface is already built and sits in `dist/`.

| File | What it is |
|---|---|
| `server.py` | Web server and API. Python standard library only: nothing to `pip install`. |
| `dist/` | The built user interface (`index.html` plus `assets/`). No external scripts, fonts or network calls. |
| `seed.csv` | The projects loaded into a brand-new database on first start. Contains real project names. |
| `rnd.db` | SQLite database, created on first start. **This is the only file that holds live data.** |
| `test_server.py` | Automated tests for the server. |
| `Dockerfile`, `start.bat` | Two optional ways to start it. |
| `web/`, `build.ps1` | Source of the user interface (React). Only needed to change the interface; see "Rebuild the interface". |

## Run it

Needs Python 3.10 or newer. No internet access is needed to run it.

```bash
python server.py
```

Then open `http://<server-name>:8080/`. On Windows you can double-click `start.bat` instead.

## Host it on an office PC

1. Unzip to a folder on a local disk, for example `C:\RnD-Command-Center`. Not a OneDrive or network folder.
2. Open `start.bat` in Notepad, remove `rem` from the `set RND_EDIT_KEY=` line and choose a passcode.
3. Double-click `start.bat`. The first start creates `rnd.db` and loads the projects from `seed.csv`.
4. When Windows Firewall asks, allow access on the private/domain network. If no prompt appears and colleagues cannot connect, IT must allow inbound TCP 8080 on this PC.
5. Colleagues on the office network open `http://<pc-name>:8080/`. `start.bat` prints the exact address.

The page is reachable only while this PC is on, awake and on the office network, and while the `start.bat` window stays open. To start it at logon, put a shortcut to `start.bat` in the folder that opens with `Win+R`, `shell:startup`.

With Docker:

```bash
docker build -t rnd-command-center .
```

```bash
docker run -d --name rnd-command-center -p 8080:8080 -v rnd-data:/data -e RND_EDIT_KEY=choose-a-passcode rnd-command-center
```

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on. |
| `HOST` | `0.0.0.0` | Address to bind. Use `127.0.0.1` to allow this machine only. |
| `RND_DB` | `rnd.db` next to `server.py` | Path of the database file. In Docker it is `/data/rnd.db`. |
| `RND_EDIT_KEY` | empty | Shared passcode for changes. See below. |
| `RND_SEED` | `seed.csv` next to `server.py` | CSV imported once into a brand-new database. If the file does not exist, invented demo projects are loaded instead. |

## Who can do what

- **Viewing** is open to anyone who can reach the server.
- **Changing data** (add, edit, move, delete, import) is open too unless `RND_EDIT_KEY` is set. When it is set, each person types the passcode once on the Data tab and their browser remembers it.
- Set `RND_EDIT_KEY` for any real deployment. It is one shared passcode, not personal accounts: the app cannot tell you *who* made a change.
- The server speaks plain HTTP. Keep it on the internal network, or put it behind the company reverse proxy for HTTPS. Do not expose it to the internet.

## Backup and restore

Stop the server, copy `rnd.db` (and `rnd.db-wal` / `rnd.db-shm` if they exist), start the server again. To restore, put the copied files back. Users can also take their own snapshot at any time with **Data > Export projects**.

## First-start data

A brand-new database is filled once, from `seed.csv` (same columns as the CSV format below). The shipped `seed.csv` holds the active projects from the R&D project tracker: code, name, group and status only. Owner, dates, stage and type were not in the tracker, so stage and type are placeholders for project owners to correct. Deleting `rnd.db` and restarting loads `seed.csv` again.

Without a `seed.csv`, the first start loads about 24 invented demo projects so the screens are not empty. **Data > Remove demo projects** deletes them for everyone and they never come back. Projects that people added or imported are not touched. A demo project that is re-imported from a CSV counts as a real project from then on.

## CSV format

Export gives a UTF-8 CSV that Excel opens directly. On PCs whose Windows region uses semicolons as the list separator (Indonesian and most European settings), use **Export with semicolons** (`/api/export.csv?sep=semicolon`), otherwise Excel shows one column. Import accepts the same columns with either commas or semicolons; rows are matched on `code` (existing code = update, new code = add) and bad rows are skipped and listed. In Excel, save as **CSV UTF-8**. Numbers must be plain (`1500000`, not `1.500.000`).

Columns: `code, name, type, category, stage, status, owner, site, start_date, target_date, progress, target_saving, realised_saving, notes`

- `type`: `NPD`, `Reformulation`, `Packaging` or `Opex`
- `stage`: `Konsep, Pengembangan, Trial / Testing, Revisi, Menunggu CEO, OK / Approved, Ready to Launch` for the first three types; `Identify, Analyse, Implement, Verify, Sustain` for `Opex`
- `status`: `On track`, `At risk`, `Delayed`, `On hold` or `Done`
- dates as `YYYY-MM-DD`, `progress` as 0 to 100, savings as plain IDR numbers

## Check that it works

```bash
python -m unittest test_server -v
```

All tests should pass. They use a temporary database and do not touch `rnd.db`.

## Rebuild the interface

Only needed after changing files in `web/`. Needs Node.js 22 or newer and internet access to the npm registry.

```bash
powershell -File build.ps1
```

The script copies `web/` to `%LOCALAPPDATA%\rnd-cc-build`, installs and builds there, and copies the result back into `dist/`. It builds outside the project folder on purpose, so `node_modules` never lands in a OneDrive-synced folder. The interface uses React, three.js with react-three-fiber (the 3D step folders), ShaderGradient (the slow moving background), Motion (interface animation) and hairline (the line-drawn figures); all of it is bundled into `dist/assets/`, nothing is loaded from the internet at run time.

## Known limits, and when to move on

This is deliberately small. It suits tens of users and a few hundred projects.

- **No personal sign-in or roles.** If per-user accountability is needed, put it behind Entra ID SSO at the reverse proxy, or rebuild the API on the standard IT stack (Go/Fiber + MySQL) keeping the same endpoints so the interface keeps working.
- **CSV only**, no native `.xlsx`.
- **One server process, one SQLite file.** Not for multiple servers behind a load balancer. Start exactly one process per database.
- **Keep `rnd.db` on a local disk.** Point `RND_DB` at a local path, not a network share or a OneDrive/SharePoint-synced folder: SQLite's write-ahead log does not work reliably there.
- **Errors go to stderr**, with no per-request access log. Capture stderr in the service manager (systemd, NSSM, Docker logs).
- **Drag and drop needs a mouse.** On touch screens, open a project and change its Stage.
- Pages refresh from the server every 15 seconds, so another person's change can take that long to appear.

## API (for integration)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | All projects plus the allowed types, stages and statuses |
| POST | `/api/projects` | Create a project |
| PUT | `/api/projects/{id}` | Update; body must include the `version` last read, a stale one returns 409 |
| DELETE | `/api/projects/{id}` | Delete one project |
| DELETE | `/api/projects?demo=1` | Remove demo projects |
| GET | `/api/activity` | Last 30 changes |
| GET | `/api/export.csv` | Download all projects |
| POST | `/api/import` | Upload CSV text, upsert by `code` |
| GET | `/`, `/assets/{file}` | The interface: `dist/index.html` and the files that exist in `dist/assets/`. Nothing else is served from disk. |

Write requests need the header `X-Edit-Key` when `RND_EDIT_KEY` is set (keep the key to plain ASCII characters). POST requests must send `Content-Type: application/json` or `text/csv`; anything else gets 415, which stops other websites from writing through a visitor's browser. Request bodies are limited to 2 MB.
