"""Nabati R&D Command Center: static page + JSON API on one SQLite file. Stdlib only."""
import csv
import datetime
import hmac
import io
import json
import math
import os
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
CTYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
          ".png": "image/png", ".woff2": "font/woff2"}
MAX_BODY = 2 * 1024 * 1024
TYPES = ["NPD", "Reformulation", "Packaging", "Opex"]
STATUSES = ["On track", "At risk", "Delayed", "On hold", "Done"]
STAGES = {"npd": ["Konsep", "Pengembangan", "Trial / Testing", "Revisi", "Menunggu CEO", "OK / Approved", "Ready to Launch"],
          "opex": ["Identify", "Analyse", "Implement", "Verify", "Sustain"]}
EDIT = ["code", "name", "type", "category", "stage", "status", "owner", "site", "start_date",
        "target_date", "progress", "target_saving", "realised_saving", "notes"]
TEXT_COLS = ["name", "category", "owner", "site", "notes"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 type TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'On track', owner TEXT NOT NULL DEFAULT '',
 site TEXT NOT NULL DEFAULT '', start_date TEXT NOT NULL DEFAULT '',
 target_date TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0,
 target_saving REAL NOT NULL DEFAULT 0, realised_saving REAL NOT NULL DEFAULT 0,
 notes TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity (
 id INTEGER PRIMARY KEY AUTOINCREMENT, project_code TEXT NOT NULL, ts TEXT NOT NULL,
 action TEXT NOT NULL);
"""


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def stage_list(t):
    return STAGES["opex" if t == "Opex" else "npd"]


# ---------------------------------------------------------------- validation
def validate(d):
    """Return (clean, errors). d is a dict of raw values; missing keys take defaults."""
    e, c = {}, {}

    def text(k, mx, req=False):
        v = d.get(k, "")
        v = "" if v is None else v
        if not isinstance(v, str):
            e[k] = "must be a string"
            return
        v = v.strip()
        if req and not v:
            e[k] = "required"
        elif len(v) > mx:
            e[k] = "max %d characters" % mx
        c[k] = v

    text("code", 30, True)
    if "code" not in e and not re.fullmatch(r"[A-Za-z0-9._-]+", c["code"]):
        e["code"] = "only letters, digits, . _ -"
    text("name", 200, True)
    for k in ("category", "owner", "site"):
        text(k, 100)
    text("notes", 2000)

    t = d.get("type")
    if not isinstance(t, str) or t not in TYPES:
        e["type"] = "must be one of " + ", ".join(TYPES)
    c["type"] = t
    s = d.get("status") or "On track"
    if not isinstance(s, str) or s not in STATUSES:
        e["status"] = "must be one of " + ", ".join(STATUSES)
    c["status"] = s
    if "type" not in e:
        sl = stage_list(t)
        g = d.get("stage") or sl[0]
        if not isinstance(g, str) or g not in sl:
            e["stage"] = "must be one of " + ", ".join(sl)
        c["stage"] = g
    else:
        c["stage"] = d.get("stage") or ""

    for k in ("start_date", "target_date"):
        v = d.get(k, "")
        v = "" if v is None else v
        ok = isinstance(v, str)
        if ok and v != "":
            try:
                ok = len(v) == 10 and bool(datetime.date.fromisoformat(v))
            except ValueError:
                ok = False
        if not ok:
            e[k] = "must be empty or YYYY-MM-DD"
        c[k] = v

    v = d.get("progress", 0)
    v = 0 if v is None or v == "" else v
    try:
        if isinstance(v, bool):
            raise ValueError
        if isinstance(v, str):
            v = int(v.strip())
        elif isinstance(v, float) and v.is_integer():
            v = int(v)
        if not isinstance(v, int) or not 0 <= v <= 100:
            raise ValueError
    except ValueError:
        e["progress"] = "must be an integer 0-100"
        v = 0
    c["progress"] = v

    for k in ("target_saving", "realised_saving"):
        v = d.get(k, 0)
        v = 0 if v is None or (isinstance(v, str) and not v.strip()) else v
        try:
            if isinstance(v, bool):
                raise ValueError
            v = float(v)
            if not math.isfinite(v) or v < 0:
                raise ValueError
        except (ValueError, TypeError, OverflowError):
            e[k] = "must be a number >= 0"
            v = 0.0
        c[k] = v
    return c, e


class HttpError(Exception):
    def __init__(self, status, payload):
        self.status, self.payload = status, payload


def invalid(fields):
    return HttpError(400, {"error": "validation failed", "fields": fields})


# ---------------------------------------------------------------- database
def log(conn, code, action):
    conn.execute("INSERT INTO activity (project_code, ts, action) VALUES (?,?,?)", (code, now(), action))


def connect(path):
    conn = sqlite3.connect(path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def seed(conn):
    today = datetime.date.today()
    iso = lambda off: (today + datetime.timedelta(days=off)).isoformat()
    M, B = 1_000_000, 1_000_000_000
    R, M_, P = "Rancaekek", "Majalengka", "Pilot Lab"
    # code,name,type,cat,stage,status,owner,site,start_ago,target_off,progress,tsave,rsave,notes
    rows = [
        ("NPD-001", "Nextar brownies new flavour", "NPD", "Nextar", "Trial / Testing", "On track", "R&D Snack Lead", P, 120, 60, 45, 0, 0, "Flavour shortlist agreed with sensory panel."),
        ("NPD-002", "Chocopie mini pack concept", "NPD", "Chocopie", "Konsep", "On track", "R&D Snack Lead", P, 30, 240, 5, 0, 0, ""),
        ("NPD-003", "Siip corn puff reduced-sodium seasoning", "NPD", "Siip", "Pengembangan", "At risk", "R&D Snack Lead", P, 90, 45, 20, 0, 0, "Taste scores below benchmark at 30% sodium cut."),
        ("NPD-004", "Waffle caramel filled variant", "NPD", "Waffle", "Revisi", "On track", "R&D Wafer Lead", M_, 200, 30, 65, 0, 0, ""),
        ("NPD-005", "Wafer cocoa cream premium line", "NPD", "Wafer", "OK / Approved", "Delayed", "R&D Wafer Lead", R, 280, -20, 80, 0, 0, "Shelf-life study extended by two weeks."),
        ("NPD-006", "Nextar sugar-reduced bar", "NPD", "Nextar", "Pengembangan", "On hold", "Sensory Lead", P, 150, 120, 15, 0, 0, "Paused pending sweetener cost review."),
        ("NPD-007", "Chocopie tropical edition", "NPD", "Chocopie", "Ready to Launch", "Done", "R&D Snack Lead", M_, 300, -15, 100, 0, 0, "Launched in all regions."),
        ("REF-001", "Cheese wafer 2.0 cream reformulation", "Reformulation", "Wafer", "Trial / Testing", "On track", "R&D Wafer Lead", R, 100, 75, 50, 0, 0, ""),
        ("REF-002", "Siip palm olein replacement trial", "Reformulation", "Siip", "Revisi", "At risk", "Process Engineer", M_, 220, 20, 60, 0, 0, "Fryer oil uptake higher than expected."),
        ("REF-003", "Waffle batter emulsifier simplification", "Reformulation", "Waffle", "Konsep", "On track", "R&D Wafer Lead", P, 40, 200, 8, 0, 0, ""),
        ("REF-004", "Nextar cream stabiliser change", "Reformulation", "Nextar", "OK / Approved", "On track", "Sensory Lead", R, 250, 35, 85, 0, 0, "Panel results due next week."),
        ("REF-005", "Chocopie marshmallow gelatin-free", "Reformulation", "Chocopie", "Ready to Launch", "Done", "R&D Snack Lead", M_, 290, -40, 100, 0, 0, ""),
        ("PKG-001", "Wafer flow-wrap downgauging 30 to 25 micron", "Packaging", "Wafer", "Revisi", "On track", "Packaging Engineer", R, 110, 50, 65, 150 * M, 20 * M, "Seal strength passing on line 2."),
        ("PKG-002", "Siip pouch recyclable mono-material", "Packaging", "Siip", "Trial / Testing", "At risk", "Packaging Engineer", M_, 160, 150, 40, 0, 0, "Barrier performance not yet matched."),
        ("PKG-003", "Nextar carton board weight reduction", "Packaging", "Nextar", "OK / Approved", "Delayed", "Packaging Engineer", R, 270, -40, 85, 200 * M, 0, "Waiting on supplier board samples."),
        ("PKG-004", "Chocopie inner tray removal", "Packaging", "Chocopie", "Pengembangan", "On track", "Packaging Engineer", P, 60, 180, 22, 0, 0, ""),
        ("OPX-001", "Wafer sheet breakage reduction line 3", "Opex", "Wafer", "Identify", "On track", "Opex Analyst", R, 30, 180, 5, int(1.8 * B), 0, ""),
        ("OPX-002", "Cream overfill giveaway control", "Opex", "Wafer", "Analyse", "On track", "Process Engineer", R, 70, 120, 25, 900 * M, 0, "Giveaway baseline measured over 4 weeks."),
        ("OPX-003", "Oven gas consumption optimisation", "Opex", "Wafer", "Implement", "At risk", "Process Engineer", M_, 150, 60, 50, int(2.5 * B), 600 * M, "Burner retrofit slipped one sprint."),
        ("OPX-004", "Changeover time reduction (SMED)", "Opex", "Waffle", "Implement", "On track", "Opex Analyst", R, 130, 90, 55, int(1.2 * B), 400 * M, ""),
        ("OPX-005", "Packaging film waste reduction line 5", "Opex", "Siip", "Verify", "Delayed", "Packaging Engineer", M_, 240, -10, 80, 700 * M, 450 * M, "Verification data gaps on night shift."),
        ("OPX-006", "Compressed air leak programme", "Opex", "Nextar", "Verify", "On track", "Process Engineer", R, 200, 40, 85, 300 * M, 280 * M, ""),
        ("OPX-007", "Reject rework loop elimination", "Opex", "Chocopie", "Sustain", "On track", "Opex Analyst", M_, 280, 15, 95, int(1.5 * B), int(1.45 * B), "Monthly audit in place."),
        ("OPX-008", "Steam trap maintenance savings", "Opex", "Wafer", "Sustain", "Done", "Process Engineer", R, 300, -30, 100, 500 * M, 540 * M, "Savings above target."),
    ]
    ts = now()
    for r in rows:
        conn.execute(
            "INSERT INTO projects (code,name,type,category,stage,status,owner,site,start_date,target_date,"
            "progress,target_saving,realised_saving,notes,is_demo,version,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?)",
            (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], iso(-r[8]), iso(r[9]), r[10], r[11], r[12], r[13], ts))
    acts = [("NPD-001", "moved to Trial / Testing"), ("REF-002", "status changed to At risk"),
            ("NPD-005", "status changed to Delayed"), ("OPX-007", "moved to Sustain"),
            ("PKG-001", "moved to Revisi"), ("OPX-003", "status changed to At risk"),
            ("REF-004", "moved to OK / Approved"), ("OPX-008", "updated")]
    base = datetime.datetime.now(datetime.timezone.utc)
    for i, (code, action) in enumerate(acts):
        t = (base - datetime.timedelta(hours=7 * (len(acts) - i))).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute("INSERT INTO activity (project_code, ts, action) VALUES (?,?,?)", (code, t, action))


def init_db(path, seed_csv=None):
    conn = connect(path)
    try:
        if conn.execute("PRAGMA user_version").fetchone()[0] == 0:
            conn.executescript(SCHEMA)
            if seed_csv and os.path.exists(seed_csv):
                with open(seed_csv, "rb") as f:
                    res = import_csv(conn, f.read())
                for er in res["errors"]:
                    sys.stderr.write("seed.csv row %s: %s\n" % (er["row"], er["error"]))
            else:
                seed(conn)
            conn.execute("PRAGMA user_version=1")
            conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------- CSV helpers
def esc(col, v):
    v = "" if v is None else str(v)
    return "'" + v if col in TEXT_COLS and re.match(r"'?[=+\-@\t\r]", v) else v


def unesc(col, v):
    return v[1:] if col in TEXT_COLS and re.match(r"'[=+\-@\t\r]", v) else v


def export_csv(conn, delimiter=","):
    out = io.StringIO()
    w = csv.writer(out, delimiter=delimiter)
    w.writerow(EDIT)
    for r in conn.execute("SELECT * FROM projects ORDER BY code"):
        w.writerow([esc(c, r[c]) for c in EDIT])
    return ("﻿" + out.getvalue()).encode("utf-8")


def import_csv(conn, raw):
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HttpError(400, {"error": "body must be UTF-8 CSV"})
    # Excel with Indonesian/European regional settings saves "CSV" with semicolons
    head = text.split("\n", 1)[0]
    rd = csv.DictReader(io.StringIO(text), delimiter=";" if head.count(";") > head.count(",") else ",")
    try:
        if not rd.fieldnames or "code" not in [h.strip().lower() for h in rd.fieldnames if h]:
            raise HttpError(400, {"error": "csv must have a code column"})
        rows = list(enumerate(rd, 1))
    except csv.Error as ex:  # NUL bytes, a single cell over 128 KB
        raise HttpError(400, {"error": "unreadable csv (%s)" % ex})
    created = updated = 0
    errors = []
    for n, row in rows:
        cells = {}
        for k, v in row.items():
            k = k.strip().lower() if k else None
            if k in EDIT and isinstance(v, str):
                cells[k] = unesc(k, v)
        for k in ("stage", "status"):  # empty cell = not given
            if cells.get(k, None) == "":
                del cells[k]
        code = cells.get("code", "").strip()
        old = conn.execute("SELECT * FROM projects WHERE code=?", (code,)).fetchone()
        merged = {k: old[k] for k in EDIT} if old else {}
        merged.update(cells)
        clean, err = validate(merged)
        if err:
            errors.append({"row": n, "error": "; ".join("%s: %s" % kv for kv in err.items())})
            continue
        if old:
            sets = ",".join("%s=?" % k for k in EDIT)
            conn.execute("UPDATE projects SET %s, is_demo=0, version=version+1, updated_at=? WHERE id=?" % sets,
                         [clean[k] for k in EDIT] + [now(), old["id"]])
            updated += 1
        else:
            insert_project(conn, clean, 0)
            created += 1
        log(conn, clean["code"], "imported")
    return {"created": created, "updated": updated, "errors": errors}


def insert_project(conn, clean, demo):
    cur = conn.execute(
        "INSERT INTO projects (%s,is_demo,version,updated_at) VALUES (%s,?,1,?)" % (",".join(EDIT), ",".join("?" * len(EDIT))),
        [clean[k] for k in EDIT] + [demo, now()])
    return cur.lastrowid


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    timeout = 30  # a stalled client must not hold a thread forever

    def log_message(self, *a):  # no per-request access log
        pass

    def log_error(self, fmt, *a):  # but real errors must reach the service log
        sys.stderr.write("%s %s %s\n" % (now(), self.address_string(), fmt % a))
        sys.stderr.flush()

    def reply(self, status, body, ctype, extra=None):
        self.send_response(status)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def json(self, status, obj):
        self.reply(status, json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def read_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise HttpError(400, {"error": "bad content-length"})
        if n < 0:
            raise HttpError(400, {"error": "bad content-length"})
        if n > MAX_BODY:
            left = min(n, 16 * MAX_BODY)  # drain so the client can read our reply
            while left > 0:
                chunk = self.rfile.read(min(65536, left))
                if not chunk:
                    break
                left -= len(chunk)
            self.close_connection = True
            raise HttpError(413, {"error": "body too large"})
        return self.rfile.read(n) if n else b""

    def json_body(self):
        try:
            d = json.loads(self.read_body().decode("utf-8") or "null")
        except (ValueError, UnicodeDecodeError):
            raise HttpError(400, {"error": "invalid JSON"})
        if not isinstance(d, dict):
            raise HttpError(400, {"error": "JSON object expected"})
        return d

    def dispatch(self, method):
        u = urlsplit(self.path)
        path, q = u.path, parse_qs(u.query)
        try:
            if method == "GET" and path in ("/", "/index.html"):
                return self.static("index.html", "text/html; charset=utf-8", "no-cache")
            if method == "GET" and path.startswith("/assets/"):
                name = path[len("/assets/"):]
                ext = os.path.splitext(name)[1]
                try:
                    listing = os.listdir(os.path.join(DIST, "assets"))
                except OSError:
                    listing = []
                # the name is matched against the folder listing, so the URL never builds a path
                if ext in CTYPES and name in listing:
                    return self.static("assets/" + name, CTYPES[ext], "public, max-age=31536000, immutable")
                raise HttpError(404, {"error": "not found"})
            m = re.fullmatch(r"/api/projects/(\d+)", path)
            known = path in ("/api/projects", "/api/activity", "/api/export.csv", "/api/import") or m
            if not known:
                raise HttpError(404, {"error": "not found"})
            # Browsers only send these two types cross-site after a preflight we never approve,
            # so another website cannot make a visitor's browser write here (CSRF).
            if method == "POST" and self.headers.get_content_type() not in ("application/json", "text/csv"):
                raise HttpError(415, {"error": "send application/json or text/csv"})
            if method != "GET":
                key = self.server.edit_key
                if key and not hmac.compare_digest(self.headers.get("X-Edit-Key", "").encode("utf-8"), key.encode("utf-8")):
                    raise HttpError(401, {"error": "edit key required"})
            conn = connect(self.server.db_path)
            try:
                self.api(conn, method, path, q, m)
            finally:
                conn.close()
        except HttpError as ex:
            self.json(ex.status, ex.payload)
        except Exception as ex:  # keep the server alive on unexpected errors
            self.log_error("error: %r", ex)
            self.json(500, {"error": "internal error"})

    def static(self, rel, ctype, cache):
        try:
            with open(os.path.join(DIST, rel), "rb") as f:
                body = f.read()
        except OSError:
            raise HttpError(404, {"error": "not found"})
        self.reply(200, body, ctype, {"Cache-Control": cache})

    def api(self, conn, method, path, q, m):
        fetch = lambda i: conn.execute("SELECT * FROM projects WHERE id=?", (i,)).fetchone()
        if path == "/api/projects" and method == "GET":
            rows = [dict(r) for r in conn.execute("SELECT * FROM projects ORDER BY code")]
            return self.json(200, {"projects": rows, "stages": STAGES, "types": TYPES, "statuses": STATUSES,
                                   "edit_key_required": bool(self.server.edit_key)})
        if path == "/api/activity" and method == "GET":
            rows = conn.execute("SELECT id,project_code,ts,action FROM activity ORDER BY ts DESC, id DESC LIMIT 30")
            return self.json(200, {"activity": [dict(r) for r in rows]})
        if path == "/api/export.csv" and method == "GET":
            sep = ";" if q.get("sep") == ["semicolon"] else ","
            return self.reply(200, export_csv(conn, sep), "text/csv; charset=utf-8", {
                "Content-Disposition": 'attachment; filename="rnd-projects.csv"', "Cache-Control": "no-store"})
        if path == "/api/import" and method == "POST":
            result = import_csv(conn, self.read_body())
            conn.commit()
            return self.json(200, result)
        if path == "/api/projects" and method == "POST":
            clean, err = validate(self.json_body())
            if err:
                raise invalid(err)
            try:
                pid = insert_project(conn, clean, 0)
            except sqlite3.IntegrityError:
                raise HttpError(409, {"error": "code already exists"})
            log(conn, clean["code"], "created")
            conn.commit()
            return self.json(201, dict(fetch(pid)))
        if path == "/api/projects" and method == "DELETE":
            if q.get("demo") != ["1"]:
                raise HttpError(400, {"error": "refusing to delete all; use ?demo=1"})
            n = conn.execute("DELETE FROM projects WHERE is_demo=1").rowcount
            conn.commit()
            return self.json(200, {"deleted": n})
        if m and method in ("PUT", "DELETE"):
            pid = int(m.group(1))
            if pid >= 2 ** 63:  # SQLite cannot bind it
                raise HttpError(404, {"error": "not found"})
            old = fetch(pid)
            if method == "DELETE":
                if not old:
                    raise HttpError(404, {"error": "not found"})
                conn.execute("DELETE FROM projects WHERE id=?", (pid,))
                log(conn, old["code"], "deleted")
                conn.commit()
                return self.json(200, {"deleted": 1})
            body = self.json_body()
            ver = body.get("version")
            if isinstance(ver, bool) or not isinstance(ver, int) or abs(ver) >= 2 ** 63:
                raise invalid({"version": "required integer"})
            if not old:
                raise HttpError(404, {"error": "not found"})
            merged = {k: old[k] for k in EDIT}
            merged.update({k: body[k] for k in EDIT if k in body})
            clean, err = validate(merged)
            if err:
                raise invalid(err)
            sets = ",".join("%s=?" % k for k in EDIT)
            try:
                cur = conn.execute("UPDATE projects SET %s, version=version+1, updated_at=? WHERE id=? AND version=?" % sets,
                                   [clean[k] for k in EDIT] + [now(), pid, ver])
            except sqlite3.IntegrityError:
                raise HttpError(409, {"error": "code already exists"})
            if cur.rowcount == 0:
                cur_row = fetch(pid)
                if cur_row:
                    raise HttpError(409, {"error": "conflict", "current": dict(cur_row)})
                raise HttpError(404, {"error": "not found"})
            if clean["stage"] != old["stage"]:
                act = "moved to " + clean["stage"]
            elif clean["status"] != old["status"]:
                act = "status changed to " + clean["status"]
            else:
                act = "updated"
            log(conn, clean["code"], act)
            conn.commit()
            return self.json(200, dict(fetch(pid)))
        raise HttpError(404, {"error": "not found"})

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")


def make_server(db_path, host="127.0.0.1", port=0, edit_key="", seed_csv=None):
    init_db(db_path, seed_csv)
    srv = ThreadingHTTPServer((host, port), Handler)
    srv.daemon_threads = True
    srv.db_path, srv.edit_key = db_path, edit_key
    return srv


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    srv = make_server(os.environ.get("RND_DB", os.path.join(HERE, "rnd.db")), host, port,
                      os.environ.get("RND_EDIT_KEY", ""),
                      seed_csv=os.environ.get("RND_SEED", os.path.join(HERE, "seed.csv")))
    print("R&D Command Center on http://%s:%d/" % ("localhost" if host == "0.0.0.0" else host, port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
    finally:
        srv.server_close()
