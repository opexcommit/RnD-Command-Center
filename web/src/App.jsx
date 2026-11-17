import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MotionConfig } from 'motion/react';
import { api, OPEX } from './lib.js';
import Boundary from './Boundary.jsx';
import Dashboard from './Dashboard.jsx';
import Pipeline from './Pipeline.jsx';
import Projects from './Projects.jsx';
import DataTab from './DataTab.jsx';
import ProjectDialog from './ProjectDialog.jsx';

const Backdrop = lazy(() => import('./Backdrop.jsx'));

const TABS = [['dashboard', 'Dashboard'], ['pipeline', 'Pipeline'], ['projects', 'Projects'], ['data', 'Data']];
const EMPTY = { projects: [], activity: [], stages: { npd: [], opex: [] }, types: [], statuses: [], keyReq: false };

export default function App() {
  const [data, setData] = useState(EMPTY);
  const [tab, setTab] = useState('dashboard');
  const [pipeSet, setPipeSet] = useState('npd');
  const [sync, setSync] = useState({ off: false, text: 'Loading' });
  const [toastMsg, setToastMsg] = useState({ text: '', on: false });
  const [dlg, setDlg] = useState(null);
  const sig = useRef('');
  const dragging = useRef(false);     // shared with Pipeline: do not redraw under a card being dragged
  const animated = useRef(false);     // the load animation plays once per page load
  const keyRef = useRef(null);
  const toastTimer = useRef();
  const dlgN = useRef(0);

  const toast = useCallback(msg => {
    setToastMsg({ text: msg, on: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(t => ({ ...t, on: false })), 4500);
  }, []);

  const load = useCallback(async force => {
    try {
      const [p, a] = await Promise.all([api('GET', '/api/projects'), api('GET', '/api/activity')]);
      const s = JSON.stringify([p.projects, a.activity, p.edit_key_required]);
      setSync({ off: false, text: 'Live, updated ' + new Date().toLocaleTimeString('en-GB') });
      if (s === sig.current && !force) return;
      if (dragging.current) return;            // next poll catches up
      sig.current = s;
      setData({ projects: OPEX ? p.projects : p.projects.filter(x => x.type !== 'Opex'), activity: a.activity, stages: p.stages, types: p.types, statuses: p.statuses, keyReq: p.edit_key_required });
    } catch {
      setSync({ off: true, text: 'Offline, retrying' });
    }
  }, []);

  const show = useCallback(t => {
    if (!TABS.some(([k]) => k === t)) t = 'dashboard';
    setTab(t);
    scrollTo(0, 0);   // a tab opened mid-scroll would hide its toolbar under the sticky header
    if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t);
  }, []);

  const handleErr = useCallback(e => {
    if (e.status === 401) {
      toast('This server needs an edit key before you can change anything. Enter it on the Data tab.');
      flushSync(() => show('data'));
      keyRef.current && keyRef.current.focus();
    }
    else if (e.status === 409) { toast('Someone else changed this project first. Showing the latest version.'); load(true); }
    else if (e.status === 413) toast('That file is larger than 2 MB. Split it and import in parts.');
    else toast(e.status ? 'Could not save: ' + e.message : 'Cannot reach the server. Check that it is running.');
  }, [toast, show, load]);

  const openDialog = useCallback(p => setDlg({ project: p || null, n: ++dlgN.current }), []);

  useEffect(() => {
    const onHash = () => show(location.hash.slice(1));
    const onVis = () => { if (!document.hidden) load(); };
    addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onVis);
    show(location.hash.slice(1) || 'dashboard');
    load(true);
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { removeEventListener('hashchange', onHash); document.removeEventListener('visibilitychange', onVis); clearInterval(timer); };
  }, [show, load]);

  // one shared tooltip for chart marks (hover and keyboard focus)
  useEffect(() => {
    const tip = document.getElementById('tip');
    const showTip = e => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (!el) { tip.classList.remove('on'); return; }
      tip.textContent = el.dataset.tip;
      const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      const x = Math.max(8, Math.min(innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2));
      let y = r.top - tr.height - 8;
      if (y < 8) y = r.bottom + 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      tip.classList.add('on');
    };
    const hide = () => tip.classList.remove('on');
    document.addEventListener('mouseover', showTip);
    document.addEventListener('focusin', showTip);
    document.addEventListener('focusout', hide);
    addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', showTip);
      document.removeEventListener('focusin', showTip);
      document.removeEventListener('focusout', hide);
      removeEventListener('scroll', hide, true);
    };
  }, []);

  const common = { data, openDialog, toast, load, handleErr };

  return (
    <MotionConfig reducedMotion="user">
      <Boundary><Suspense fallback={null}><Backdrop /></Suspense></Boundary>
      <header className="top">
        <div className="top-in">
          <div className="brand"><span className="mark" aria-hidden="true">Nabati</span><h1>R&amp;D Command Center</h1></div>
          <nav aria-label="Views">
            {TABS.map(([k, label]) =>
              <button key={k} className="tab" data-tab={k} aria-current={tab === k ? 'page' : undefined} onClick={() => show(k)}>{label}</button>)}
          </nav>
          <div className="top-right">
            <span className={'sync' + (sync.off ? ' off' : '')} id="sync" role="status"><i /><span>{sync.text}</span></span>
            <button className="btn primary" id="add" onClick={() => openDialog(null)}>Add project</button>
          </div>
        </div>
      </header>

      <main>
        <section id="dashboard" aria-label="Dashboard" hidden={tab !== 'dashboard'}><Dashboard {...common} animated={animated} /></section>
        <section id="pipeline" aria-label="Pipeline" hidden={tab !== 'pipeline'}><Pipeline {...common} pipeSet={pipeSet} setPipeSet={setPipeSet} dragging={dragging} /></section>
        <section id="projects" aria-label="Projects" hidden={tab !== 'projects'}><Projects {...common} /></section>
        <section id="data" aria-label="Data" hidden={tab !== 'data'}><DataTab {...common} keyRef={keyRef} /></section>
      </main>

      <ProjectDialog state={dlg} close={() => setDlg(null)} data={data} pipeSet={pipeSet} tab={tab} toast={toast} load={load} handleErr={handleErr} />

      <div id="tip" role="tooltip" />
      <div id="toast" role="status" aria-live="polite" className={toastMsg.on ? 'on' : undefined}>{toastMsg.text}</div>
    </MotionConfig>
  );
}
