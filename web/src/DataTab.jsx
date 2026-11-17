import { useRef, useState } from 'react';
import { api, plural, setKey } from './lib.js';

export default function DataTab({ data, toast, load, handleErr, keyRef }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const demo = data.projects.filter(p => p.is_demo).length;

  async function doImport() {
    const f = fileRef.current.files[0];
    if (!f) { toast('Choose a CSV file first.'); return; }
    setBusy(true);
    try {
      const r = await api('POST', '/api/import', null, await f.text());
      setResult({ r });
      fileRef.current.value = '';
      await load(true);
    } catch (e) {
      if (e.status === 400) setResult({ fail: 'Nothing was imported: ' + e.message + '. Export first to get a file with the right column names.' });
      else handleErr(e);
    } finally { setBusy(false); }
  }

  async function clearDemo() {
    if (!demo || !confirm(`Remove ${plural(demo, 'demo project', 'demo projects')} for everyone? Projects your team added or imported stay.`)) return;
    try { const r = await api('DELETE', '/api/projects?demo=1'); toast(`${plural(r.deleted, 'demo project', 'demo projects')} removed`); await load(true); }
    catch (e) { handleErr(e); }
  }

  const r = result && result.r;
  return (
    <div className="stack">
      <div className="panel">
        <h3>Export</h3>
        <p>Download every project as a CSV file. It opens directly in Excel and is also the template for importing.</p>
        <div className="inline">
          <a className="btn" href="/api/export.csv" download="rnd-projects.csv">Export projects</a>
          <a className="btn" href="/api/export.csv?sep=semicolon" download="rnd-projects.csv">Export with semicolons</a>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>If Excel puts everything in one column, your Windows region uses semicolons. Use the second button.</p>
      </div>
      <div className="panel">
        <h3>Import</h3>
        <p>Upload a CSV with the same columns as the export. Rows are matched on the project code: a known code updates that project, a new code adds one. In Excel, save as "CSV UTF-8"; commas and semicolons both work. Write savings as plain numbers, for example 1500000.</p>
        <div className="inline">
          <input type="file" id="file" accept=".csv,text/csv" aria-label="CSV file to import" ref={fileRef} />
          <button className="btn" id="import" disabled={busy} onClick={doImport}>Import projects</button>
        </div>
        <div id="importResult" aria-live="polite">
          {result && (
            <div className="result">
              {r ? <>
                {`${plural(r.created, 'project', 'projects')} added, ${r.updated} updated` + (r.errors.length ? `, ${plural(r.errors.length, 'row', 'rows')} skipped:` : '.')}
                {r.errors.length ? (
                  <ul>
                    {r.errors.slice(0, 20).map((e, i) => <li key={i}>{`Row ${e.row}: ${e.error}`}</li>)}
                    {r.errors.length > 20 ? <li>{`and ${r.errors.length - 20} more`}</li> : null}
                  </ul>
                ) : null}
              </> : result.fail}
            </div>
          )}
        </div>
      </div>
      <div className="panel">
        <h3>Demo data</h3>
        <p id="demoText">{demo
          ? `${plural(demo, 'made-up demo project is', 'made-up demo projects are')} loaded so the screens are not empty. Removing them keeps everything you added or imported.`
          : 'No demo projects are left. Everything here was added or imported by your team.'}</p>
        <button className="btn danger" id="clearDemo" disabled={!demo} onClick={clearDemo}>Remove demo projects</button>
      </div>
      <div className="panel">
        <h3>Edit key</h3>
        <p id="keyText">{data.keyReq
          ? 'This server needs an edit key to add, change or delete projects. Ask the R&D digitalization team for it. It is stored in this browser only.'
          : 'This server does not need an edit key, so anyone who can open this page can make changes. IT can switch one on with the RND_EDIT_KEY setting.'}</p>
        <div className="inline">
          <input className="field" id="key" type="password" autoComplete="off" aria-label="Edit key" ref={keyRef} />
          <button className="btn" id="saveKey" onClick={() => { setKey(keyRef.current.value); keyRef.current.value = ''; toast('Edit key saved in this browser'); }}>Save edit key</button>
        </div>
      </div>
    </div>
  );
}
