import json
import os
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

import server

HERE = os.path.dirname(os.path.abspath(server.__file__))
NEW = {"code": "T-1", "name": "Test project", "type": "NPD"}


class T(unittest.TestCase):
    def start(self, edit_key=""):
        srv = server.make_server(self.db, edit_key=edit_key)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (srv.shutdown(), srv.server_close()))
        return "http://127.0.0.1:%d" % srv.server_address[1]

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.db = os.path.join(self.dir, "t.db")
        self.base = self.start()
        self.addCleanup(shutil.rmtree, self.dir, True)

    def call(self, method, path, body=None, headers=None, raw=None, base=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        headers = dict(headers or {})
        if data is not None:
            headers.setdefault("Content-Type", "text/csv" if raw is not None else "application/json")
        req = urllib.request.Request((base or self.base) + path, data=data, method=method, headers=headers)
        try:
            r = urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            r = e
        txt = r.read().decode("utf-8")
        if "json" in (r.headers.get("Content-Type") or ""):
            txt = json.loads(txt)
        return r.status if hasattr(r, "status") else r.code, txt

    def projects(self):
        return self.call("GET", "/api/projects")[1]["projects"]

    def test_01_list(self):
        s, d = self.call("GET", "/api/projects")
        self.assertEqual(s, 200)
        self.assertGreaterEqual(len(d["projects"]), 20)
        self.assertEqual(d["types"], server.TYPES)
        self.assertEqual(d["statuses"], server.STATUSES)
        self.assertEqual(d["stages"], server.STAGES)
        self.assertFalse(d["edit_key_required"])

    def test_02_create_dup(self):
        s, p = self.call("POST", "/api/projects", NEW)
        self.assertEqual(s, 201)
        self.assertEqual(p["stage"], "Konsep")
        self.assertIn("T-1", [x["code"] for x in self.projects()])
        self.assertEqual(self.call("POST", "/api/projects", NEW)[0], 409)

    def test_03_validation(self):
        bad = [("type", {"type": "Nope"}), ("stage", {"stage": "Sustain"}), ("progress", {"progress": 150}),
               ("start_date", {"start_date": "2026-13-01"}), ("name", {"name": "  "})]
        for field, patch in bad:
            s, d = self.call("POST", "/api/projects", dict(NEW, **patch))
            self.assertEqual(s, 400, field)
            self.assertIn(field, d["fields"])
        s, d = self.call("POST", "/api/projects", dict(NEW, type="Opex", stage="Launch"))
        self.assertIn("stage", d["fields"])

    def test_04_update_conflict(self):
        p = self.call("POST", "/api/projects", NEW)[1]
        s, u = self.call("PUT", "/api/projects/%d" % p["id"], {"version": 1, "progress": 10})
        self.assertEqual((s, u["version"], u["progress"]), (200, 2, 10))
        s, d = self.call("PUT", "/api/projects/%d" % p["id"], {"version": 1, "progress": 20})
        self.assertEqual(s, 409)
        self.assertEqual(d["current"]["version"], 2)

    def test_05_update_missing(self):
        p = self.call("POST", "/api/projects", NEW)[1]
        self.assertEqual(self.call("PUT", "/api/projects/%d" % p["id"], {"progress": 1})[0], 400)
        self.assertEqual(self.call("PUT", "/api/projects/99999", {"version": 1})[0], 404)

    def test_06_delete(self):
        p = self.call("POST", "/api/projects", NEW)[1]
        self.assertEqual(self.call("DELETE", "/api/projects/%d" % p["id"])[0], 200)
        self.assertEqual(self.call("DELETE", "/api/projects/%d" % p["id"])[0], 404)
        self.assertEqual(self.call("DELETE", "/api/projects")[0], 400)

    def test_07_clear_demo(self):
        self.call("POST", "/api/projects", NEW)
        s, d = self.call("DELETE", "/api/projects?demo=1")
        self.assertEqual(s, 200)
        self.assertGreater(d["deleted"], 0)
        self.assertEqual([x["code"] for x in self.projects()], ["T-1"])
        base2 = self.start()
        self.assertEqual([x["code"] for x in self.call("GET", "/api/projects", base=base2)[1]["projects"]], ["T-1"])

    def test_08_roundtrip(self):
        self.call("POST", "/api/projects", dict(NEW, name="=SUM(1,2)", notes="@x"))
        s, csv_text = self.call("GET", "/api/export.csv")
        self.assertEqual(s, 200)
        self.assertTrue(csv_text.startswith("﻿code,name,type,category,stage,status"))
        s, r = self.call("POST", "/api/import", raw=csv_text.encode("utf-8"), headers={"Content-Type": "text/csv"})
        self.assertEqual(s, 200)
        self.assertEqual(r["errors"], [])
        self.assertEqual(r["updated"], len(self.projects()))
        self.assertEqual(r["created"], 0)
        p = [x for x in self.projects() if x["code"] == "T-1"][0]
        self.assertEqual((p["name"], p["notes"]), ("=SUM(1,2)", "@x"))

    def test_09_import_errors(self):
        body = "Code,Name,Type\nIMP-1,Good,NPD\nIMP-2,Bad,Nope\n"
        s, r = self.call("POST", "/api/import", raw=body.encode())
        self.assertEqual((s, r["created"], len(r["errors"]), r["errors"][0]["row"]), (200, 1, 1, 2))
        self.assertEqual(self.call("POST", "/api/import", raw=b"name,type\nx,NPD\n")[0], 400)

    def test_10_edit_key(self):
        base = self.start("s3cret")
        self.assertEqual(self.call("POST", "/api/projects", NEW, base=base)[0], 401)
        self.assertEqual(self.call("POST", "/api/projects", NEW, headers={"X-Edit-Key": "bad"}, base=base)[0], 401)
        self.assertEqual(self.call("POST", "/api/projects", NEW, headers={"X-Edit-Key": "s3cret"}, base=base)[0], 201)
        s, d = self.call("GET", "/api/projects", base=base)
        self.assertEqual((s, d["edit_key_required"]), (200, True))

    def test_11_big_body(self):
        s, _ = self.call("POST", "/api/projects", raw=b" " * (2 * 1024 * 1024 + 1))
        self.assertEqual(s, 413)

    def test_12_activity(self):
        p = self.call("POST", "/api/projects", NEW)[1]
        self.call("PUT", "/api/projects/%d" % p["id"], {"version": 1, "stage": "Pengembangan"})
        s, d = self.call("GET", "/api/activity")
        a = d["activity"]
        self.assertEqual((s, a[0]["action"], a[0]["project_code"]), (200, "moved to Pengembangan", "T-1"))
        self.assertEqual(a[1]["action"], "created")
        self.assertLessEqual(len(a), 30)
        self.assertEqual([x["ts"] for x in a], sorted((x["ts"] for x in a), reverse=True))

    def test_13_static(self):
        s, _ = self.call("GET", "/")
        self.assertEqual(s, 200 if os.path.exists(os.path.join(HERE, "dist", "index.html")) else 404)
        self.assertEqual(self.call("GET", "/server.py")[0], 404)

    def test_17_assets(self):
        ad = os.path.join(HERE, "dist", "assets")
        files = [f for f in (os.listdir(ad) if os.path.isdir(ad) else []) if f.endswith((".js", ".css"))]
        if not files:
            self.skipTest("dist/assets not built")
        s, _ = self.call("GET", "/assets/" + files[0])
        self.assertEqual(s, 200)
        want = "javascript" if files[0].endswith(".js") else "css"
        with urllib.request.urlopen(self.base + "/assets/" + files[0]) as r:
            self.assertIn(want, r.headers["Content-Type"])
        for bad in ("/assets/nope.js", "/assets/..%2fserver.py", "/assets/../server.py"):
            self.assertEqual(self.call("GET", bad)[0], 404, bad)

    def test_18_seed_csv(self):
        csv_path = os.path.join(self.dir, "seed.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(",".join(server.EDIT) + "\n")
            f.write("S-1,Seed one,NPD,Snack,Konsep,On track,,,,,0,0,0,\n")
            f.write("S-2,Seed two,NPD,Beverage,Pengembangan,At risk,,,,,0,0,0,\n")
        db = os.path.join(self.dir, "seeded.db")

        def run(delete=None):
            srv = server.make_server(db, seed_csv=csv_path)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            base = "http://127.0.0.1:%d" % srv.server_address[1]
            try:
                if delete:
                    self.call("DELETE", "/api/projects/%d" % delete, base=base)
                return self.call("GET", "/api/projects", base=base)[1]["projects"]
            finally:
                srv.shutdown()
                srv.server_close()

        ps = run()
        self.assertEqual(sorted(p["code"] for p in ps), ["S-1", "S-2"])
        self.assertEqual([p["is_demo"] for p in ps], [0, 0])
        ps = run(delete=ps[0]["id"])
        self.assertEqual(len(ps), 1)
        self.assertEqual(len(run()), 1)

    def test_14_cross_site_post_refused(self):
        # what a hostile web page can send without a preflight
        for ctype in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data"):
            s, _ = self.call("POST", "/api/import", raw=b"code,name,type\nX-1,x,NPD\n", headers={"Content-Type": ctype})
            self.assertEqual(s, 415)
            s, _ = self.call("POST", "/api/projects", NEW, headers={"Content-Type": ctype})
            self.assertEqual(s, 415)
        self.assertNotIn("X-1", [p["code"] for p in self.projects()])

    def test_15_semicolon_csv(self):
        s, txt = self.call("GET", "/api/export.csv?sep=semicolon")
        self.assertTrue(txt.startswith("﻿code;name;type;"))
        s, r = self.call("POST", "/api/import", raw=txt.encode("utf-8"))
        self.assertEqual((s, r["errors"], r["created"], r["updated"]), (200, [], 0, len(self.projects())))
        s, r = self.call("POST", "/api/import", raw="code;name;type;notes\nSC-1;Semi, with comma;Opex;a;b\n".encode())
        self.assertEqual((s, r["created"]), (200, 1))

    def test_16_bad_input_is_400_not_500(self):
        self.assertEqual(self.call("POST", "/api/projects", raw=('{"code":"B-1","name":"x","type":"NPD","target_saving":1' + "0" * 400 + "}").encode(),
                                   headers={"Content-Type": "application/json"})[0], 400)
        self.assertEqual(self.call("DELETE", "/api/projects/99999999999999999999")[0], 404)
        p = self.call("POST", "/api/projects", NEW)[1]
        self.assertEqual(self.call("PUT", "/api/projects/%d" % p["id"], {"version": 10 ** 30})[0], 400)
        self.assertEqual(self.call("POST", "/api/import", raw=b"code,name,type\nN-1,a\x00b,NPD\n")[0], 400)


if __name__ == "__main__":
    unittest.main()
