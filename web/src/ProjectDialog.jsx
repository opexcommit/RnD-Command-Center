import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api, stageSet, OPEX } from './lib.js';

const SLOTS = ['code', 'type', 'name', 'stage', 'status', 'category', 'site', 'owner', 'progress', 'start_date', 'target_date', 'target_saving', 'realised_saving', 'notes'];
const TEXT = ['code', 'name', 'type', 'stage', 'status', 'category', 'site', 'owner', 'start_date', 'target_date', 'notes'];

const wantsSaving = (type, ts, rs) => type === 'Opex' || type === 'Packaging' || +ts > 0 || +rs > 0;

function ProjectForm({ project: p, data, pipeSet, tab, shut, toast, load, handleErr }) {
  const d = p || { code: '', name: '', type: pipeSet === 'opex' && tab === 'pipeline' ? 'Opex' : 'NPD', status: 'On track', category: '', site: '', owner: '', progress: 0, start_date: '', target_date: '', target_saving: 0, realised_saving: 0, notes: '', stage: '' };
  const { projects, types, statuses, stages } = data;
  const [type, setType] = useState(d.type);
  const [showSaving, setShowSaving] = useState(wantsSaving(d.type, d.target_saving, d.realised_saving));
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const ver = useRef(p ? p.version : null);   // bumped on a 409 conflict so a second Save overwrites
  const formRef = useRef(null);

  const uniq = k => [...new Set(projects.map(x => x[k]).filter(Boolean))].sort();
  const stageList = stages[stageSet(type)] || [];
  const err = k => <span className="err" data-err={k}>{errs[k]}</span>;

  function onType(e) {
    const t = e.target.value, f = formRef.current.elements;
    setType(t);
    setShowSaving(wantsSaving(t, f.target_saving.value, f.realised_saving.value));
  }

  async function submit(e) {
    e.preventDefault();
    setErrs({}); setFormErr('');
    const f = e.currentTarget, v = Object.fromEntries(new FormData(f));
    const body = {};
    for (const k of TEXT) body[k] = String(v[k] ?? '').trim();
    body.progress = v.progress === '' ? 0 : Number(v.progress);
    body.target_saving = Number(v.target_saving) || 0;
    body.realised_saving = Number(v.realised_saving) || 0;
    setSaving(true);
    try {
      if (p) await api('PUT', '/api/projects/' + p.id, { ...body, version: ver.current });
      else await api('POST', '/api/projects', body);
      shut();
      toast(p ? `${body.code} saved` : `${body.code} added`);
      await load(true);
    } catch (er) {
      if (er.status === 400 && er.data && er.data.fields) {
        const next = {};
        let first;
        for (const [k, msg] of Object.entries(er.data.fields)) if (SLOTS.includes(k)) { next[k] = msg; first ||= k; }
        if (first) {
          flushSync(() => { setErrs(next); if (first === 'target_saving' || first === 'realised_saving') setShowSaving(true); });
          f.elements[first].focus();
        } else setFormErr(er.message);
      } else if (er.status === 409 && p && er.data && er.data.current) {
        ver.current = er.data.current.version;
        setFormErr('Someone else saved this project while you were editing. Select "Save project" again to keep your version, or "Cancel" to keep theirs.');
        load(true);
      } else if (er.status === 409) {
        setErrs({ code: 'This code is already used by another project. Choose a different one.' });
        f.elements.code.focus();
      } else if (er.status === 404) {
        shut(); toast('This project was deleted by someone else.'); load(true);
      } else { shut(); handleErr(er); }
    } finally { setSaving(false); }
  }

  async function del() {
    if (!p || !confirm(`Delete ${p.code}? This removes it for everyone and cannot be undone.`)) return;
    try { await api('DELETE', '/api/projects/' + p.id); shut(); toast(`${p.code} deleted`); await load(true); }
    catch (e) { shut(); e.status === 404 ? load(true) : handleErr(e); }
  }

  return (
    <form id="form" method="dialog" noValidate ref={formRef} onSubmit={submit}>
      <div className="dlg-head"><h2 id="dlgTitle">{p ? `Edit ${p.code}` : 'Add project'}</h2><button type="button" className="x" id="dlgX" aria-label="Close" onClick={shut}>&times;</button></div>
      <div className="dlg-body">
        <div className="formerr" id="formErr" hidden={!formErr} role="alert">{formErr}</div>
        <label>Code<input className="field" name="code" maxLength={30} placeholder="NPD-025" defaultValue={d.code} readOnly={!!p} />{err('code')}</label>
        <label>Type<select className="field" name="type" defaultValue={d.type} onChange={onType}>{types.filter(v => OPEX || v !== 'Opex').map(v => <option key={v} value={v}>{v}</option>)}</select>{err('type')}</label>
        <label className="wide">Project name<input className="field" name="name" maxLength={200} defaultValue={d.name} />{err('name')}</label>
        <label>Stage<select className="field" name="stage" defaultValue={d.stage}>{stageList.map(v => <option key={v} value={v}>{v}</option>)}</select>{err('stage')}</label>
        <label>Status<select className="field" name="status" defaultValue={d.status}>{statuses.map(v => <option key={v} value={v}>{v}</option>)}</select>{err('status')}</label>
        <label>Category<input className="field" name="category" maxLength={100} list="cats" defaultValue={d.category} />{err('category')}</label>
        <label>Site<input className="field" name="site" maxLength={100} list="sites" defaultValue={d.site} />{err('site')}</label>
        <label>Owner<input className="field" name="owner" maxLength={100} list="owners" defaultValue={d.owner} />{err('owner')}</label>
        <label>Progress (%)<input className="field" name="progress" type="number" min="0" max="100" step="1" defaultValue={d.progress} />{err('progress')}</label>
        <label>Start date<input className="field" name="start_date" type="date" defaultValue={d.start_date} />{err('start_date')}</label>
        <label>Target date<input className="field" name="target_date" type="date" defaultValue={d.target_date} />{err('target_date')}</label>
        <label data-saving hidden={!showSaving}>Target saving (IDR per year)<input className="field" name="target_saving" type="number" min="0" step="1000000" defaultValue={d.target_saving} />{err('target_saving')}</label>
        <label data-saving hidden={!showSaving}>Realised saving (IDR)<input className="field" name="realised_saving" type="number" min="0" step="1000000" defaultValue={d.realised_saving} />{err('realised_saving')}</label>
        <label className="wide">Notes<textarea className="field" name="notes" rows={3} maxLength={2000} defaultValue={d.notes} />{err('notes')}</label>
      </div>
      <div className="dlg-foot">
        {p ? <button type="button" className="btn danger" id="del" onClick={del}>Delete project</button> : null}
        <button type="button" className="btn" id="cancel" onClick={shut}>Cancel</button>
        <button type="submit" className="btn primary" id="save" disabled={saving}>Save project</button>
      </div>
      <datalist id="cats">{uniq('category').map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="sites">{uniq('site').map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="owners">{uniq('owner').map(v => <option key={v} value={v} />)}</datalist>
    </form>
  );
}

export default function ProjectDialog({ state, close, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!state || d.open) return;
    d.showModal();
    const f = d.querySelector(state.project ? '[name="name"]' : '[name="code"]');
    f && f.focus();
  }, [state]);
  const shut = () => ref.current.close();
  return (
    <dialog id="dlg" ref={ref} aria-labelledby="dlgTitle" onClose={close}>
      {state ? <ProjectForm key={state.n} project={state.project} shut={shut} {...rest} /> : null}
    </dialog>
  );
}
