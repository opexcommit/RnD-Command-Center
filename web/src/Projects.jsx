import { useState } from 'react';
import { stageSet, idr, days, fmtDate, due, plural, OPEX } from './lib.js';
import { StatusPill } from './StatusIcon.jsx';
import Figure from './Figure.jsx';

const COLS = [
  ['code', 'Code'], ['name', 'Project'], ['type', 'Type'], ['stage', 'Stage'], ['status', 'Status'],
  ['owner', 'Owner'], ['site', 'Site'], ['target_date', 'Target date'], ['progress', 'Progress', 1], ['realised_saving', 'Savings', 1]
].filter(c => OPEX || c[0] !== 'realised_saving');

export default function Projects({ data, openDialog }) {
  const [q, setQ] = useState('');
  const [ft, setFt] = useState('');
  const [fs, setFs] = useState('');
  const [sort, setSort] = useState({ k: 'code', d: 1 });
  const { projects, stages, statuses, types } = data;

  function sortVal(p, k) {
    if (k === 'stage') return (stages[stageSet(p.type)] || []).indexOf(p.stage) + (p.type === 'Opex' ? 100 : 0);
    if (k === 'status') return statuses.indexOf(p.status);
    if (k === 'target_date') return p.target_date || '9999';
    const v = p[k];
    return typeof v === 'string' ? v.toLowerCase() : v;
  }

  const needle = q.trim().toLowerCase();
  const rows = projects.filter(p => (!ft || p.type === ft) && (!fs || p.status === fs) &&
    (!needle || [p.code, p.name, p.owner, p.site, p.category].join(' ').toLowerCase().includes(needle)));
  rows.sort((a, b) => { const x = sortVal(a, sort.k), y = sortVal(b, sort.k); return (x < y ? -1 : x > y ? 1 : a.code.localeCompare(b.code)) * sort.d; });

  return (
    <>
      <div className="bar-top">
        <input className="field" id="q" type="search" placeholder="Search code, name, owner, site" aria-label="Search projects"
          style={{ flex: 1, minWidth: '200px', maxWidth: '340px' }} value={q} onChange={e => setQ(e.target.value)} />
        <select className="field" id="fType" aria-label="Filter by type" value={ft} onChange={e => setFt(e.target.value)}>
          <option value="">All types</option>{types.filter(v => OPEX || v !== 'Opex').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="field" id="fStatus" aria-label="Filter by status" value={fs} onChange={e => setFs(e.target.value)}>
          <option value="">All statuses</option>{statuses.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="hint" id="count">{rows.length === projects.length ? plural(rows.length, 'project', 'projects') : `${rows.length} of ${projects.length} projects`}</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {COLS.map(([k, label, right]) => (
                <th key={k} className={right ? 'r' : undefined} scope="col" aria-sort={sort.k === k ? (sort.d > 0 ? 'ascending' : 'descending') : undefined}>
                  <button type="button" onClick={() => setSort({ k, d: sort.k === k ? -sort.d : 1 })}>{label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const n = days(p.target_date), lateRow = n != null && n < 0 && p.status !== 'Done';
              return (
                <tr key={p.id} tabIndex={0} onClick={() => openDialog(p)} onKeyDown={e => { if (e.key === 'Enter') openDialog(p); }}>
                  <td className="num">{p.code}</td>
                  <td>{p.name}{p.category ? <span className="t2">{p.category}</span> : null}</td>
                  <td>{p.type}</td><td>{p.stage}</td><td><StatusPill status={p.status} /></td>
                  <td className="nw">{p.owner}</td><td className="nw">{p.site}</td>
                  <td className="nw">{p.target_date ? fmtDate(p.target_date) : ''}{lateRow ? <span className="t2" style={{ color: 'var(--late)', fontWeight: 600 }}>{due(p.target_date)}</span> : null}</td>
                  <td className="r">{p.progress + '%'}</td>
                  {OPEX ? <td className="r">{p.target_saving || p.realised_saving ? <>{idr(p.realised_saving)}<span className="t2">{'of ' + idr(p.target_saving)}</span></> : ''}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="empty" id="noRows" hidden={rows.length > 0}>
          {projects.length ? <Figure kind="loupe" label="A magnifier over a blank sheet: nothing found" className="figure-sm" /> : null}
          <b>{projects.length ? 'No project matches these filters' : 'No projects yet'}</b>
          {projects.length ? 'Clear the search box or set the filters back to "All".' : 'Add a project with the button at the top right, or import a CSV on the Data tab.'}
        </div>
      </div>
    </>
  );
}
