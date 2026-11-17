import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { stageSet, idr, days, fmtDate, due, ago, plural, OPEX } from './lib.js';
import { StatusIcon } from './StatusIcon.jsx';
import Figure from './Figure.jsx';
import Boundary from './Boundary.jsx';

const Folders3D = lazy(() => import('./Folders3D.jsx'));

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const int = v => String(Math.round(v));

function CountUp({ to, fmt, intro }) {
  const ref = useRef(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current, play = intro && first.current;
    first.current = false;
    if (!play || REDUCED || !to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    let raf;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(to * e);
      if (k < 1) raf = requestAnimationFrame(step); else el.textContent = fmt(to);
    })(t0);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className="big" ref={ref}>{fmt(to)}</span>;
}

// Drifts the chips sideways with a transform. Setting scrollLeft every frame would fire a scroll event per frame,
// and react-three-fiber waits for scrolling to stop before it sizes a canvas, so the 3D parts would never start.
// While the pointer or keyboard focus is inside, the offset is handed to real scrolling so wheel, touch and Tab work.
function Ribbon({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (REDUCED) return;
    const el = ref.current, strip = el.firstChild;
    let raf, last = performance.now(), x = 0, dir = 1, drifting = false;
    const step = t => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(50, t - last); last = t;
      const max = strip.offsetWidth - el.clientWidth;
      const held = max <= 0 || el.matches(':hover, :focus-within');
      if (held && drifting) { strip.style.transform = ''; el.scrollLeft += x; drifting = false; }
      if (held) return;
      if (!drifting) { x = el.scrollLeft; el.scrollLeft = 0; drifting = true; }
      x = Math.max(0, Math.min(max, x + dir * dt * 0.03));      // 30 px per second
      if (x === max) dir = -1; else if (x === 0) dir = 1;       // shortcut: turns back at the ends instead of looping, upgrade to a duplicated strip if a one-way ticker is wanted
      strip.style.transform = `translateX(${-x}px)`;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="ribbon" ref={ref}><div className="ribbon-strip">{children}</div></div>;
}

function Track({ kind, title, stages, projects, openDialog }) {
  const list = projects.filter(p => stageSet(p.type) === kind);
  const groups = stages.map(st => list.filter(p => p.stage === st));
  const [picked, setPicked] = useState(null);
  const [has3d, setHas3d] = useState(false);
  // open the first step that has projects until the user points at another
  const active = picked != null && picked < stages.length ? picked : Math.max(0, groups.findIndex(g => g.length));
  const items = groups[active] || [];
  return (
    <div className="track">
      <h3>{title} <span className="sub">{plural(list.length, 'project', 'projects')}</span></h3>
      <div className={'folder-row' + (has3d ? ' has3d' : '')} style={{ '--n': stages.length }}>
        <div className="folder-scene" aria-hidden="true">
          <Boundary><Suspense fallback={null}><Folders3D n={stages.length} active={active} onReady={() => setHas3d(true)} /></Suspense></Boundary>
        </div>
        {stages.map((st, i) => (
          <button key={st} type="button" className="fbtn" style={{ '--i': i }} aria-pressed={i === active}
            aria-label={`${st}, ${plural(groups[i].length, 'project', 'projects')}`}
            onPointerEnter={() => setPicked(i)} onFocus={() => setPicked(i)} onClick={() => setPicked(i)}>
            <span className="gate-name">{st}</span><span className="gate-n">{groups[i].length}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stages[active]} className="folder-body" role="group" aria-label={`${stages[active]} projects`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
          {items.length ? (
            <Ribbon>
              {items.map(p => (
                <motion.button key={p.id} className="chip" type="button" whileHover={{ y: -2 }}
                  data-tip={`${p.code}  ${p.name}\n${p.status}, ${p.progress}% complete${p.target_date ? '\nTarget ' + fmtDate(p.target_date) : ''}`}
                  aria-label={`${p.code} ${p.name}, ${p.status}`}
                  onClick={() => openDialog(p)}>
                  <StatusIcon status={p.status} /><span className="num">{p.code}</span><span className="chip-name">{p.name}</span>
                </motion.button>
              ))}
            </Ribbon>
          ) : <span className="hint">No projects at this step</span>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function Dashboard({ data, openDialog, animated }) {
  const { projects: P, activity, stages, statuses } = data;
  // The intro (step labels rise, numbers count up) plays once per page load, on the first render that has projects.
  const introRef = useRef(false);
  if (P.length && !animated.current) { animated.current = true; introRef.current = true; }
  const [introOn, setIntroOn] = useState(true);
  useEffect(() => {
    if (!introRef.current) return;
    const t = setTimeout(() => setIntroOn(false), 5000);   // well past the last intro delay
    return () => clearTimeout(t);
  }, [P.length > 0]);
  const intro = introRef.current && introOn && !REDUCED;
  const cls = intro ? ' intro' : '';

  if (!P.length) {
    return (
      <div className="panel empty">
        <Figure kind="plot" label="An empty bar chart: no projects yet" className="figure-sm" />
        <b>No projects yet</b>
        Add your first project with the button at the top right, or import a CSV on the Data tab.
      </div>
    );
  }

  const open = P.filter(p => p.status !== 'Done');
  const risk = P.filter(p => p.status === 'At risk').length, late = P.filter(p => p.status === 'Delayed').length;
  const due90 = open.filter(p => { const n = days(p.target_date); return n != null && n >= 0 && n <= 90; }).length;
  const overdue = open.filter(p => { const n = days(p.target_date); return n != null && n < 0; }).length;
  const target = P.reduce((s, p) => s + p.target_saving, 0), real = P.reduce((s, p) => s + p.realised_saving, 0);
  const pct = target ? Math.round(real / target * 100) : 0;

  // savings by site: realised (thin dark) over target (wide light), one shared scale
  const sites = {};
  for (const p of P) if (p.target_saving > 0 || p.realised_saving > 0) {
    const s = sites[p.site || 'No site'] ||= { t: 0, r: 0, n: 0 };
    s.t += p.target_saving; s.r += p.realised_saving; s.n++;
  }
  const rows = Object.entries(sites).sort((a, b) => b[1].t - a[1].t);
  const max = Math.max(1, ...rows.map(([, s]) => Math.max(s.t, s.r)));
  const next = open.filter(p => p.target_date).sort((a, b) => a.target_date.localeCompare(b.target_date)).slice(0, 6);
  const trackProps = { projects: P, openDialog };

  return (
    <>
      <div className={'flow' + cls}>
        <div className="flow-head">
          <div>
            <h2>Where every project stands</h2>
            <p>Each folder is a step. Point at a folder to open it and watch its projects drift past; select a project to edit.</p>
          </div>
          <Figure kind="slow" label="Crates passing through a gate" className="figure-flow" />
        </div>
        <Track kind="npd" title="Product development" stages={stages.npd} {...trackProps} />
        {OPEX ? <Track kind="opex" title="Opex initiatives" stages={stages.opex} {...trackProps} /> : null}
        <div className="legend">
          {statuses.map(st => <span key={st}><StatusIcon status={st} />{st} <b>{P.filter(p => p.status === st).length}</b></span>)}
        </div>
      </div>

      <dl className={'kpis' + cls}>
        <div className="kpi"><dt>Active projects</dt><dd><CountUp to={open.length} fmt={int} intro={intro} />
          <span className="note">{OPEX ? `${open.filter(p => p.type !== 'Opex').length} product, ${open.filter(p => p.type === 'Opex').length} Opex` : plural(P.length, 'project', 'projects') + ' in total'}</span></dd></div>
        <div className="kpi"><dt>Need attention</dt><dd><CountUp to={risk + late} fmt={int} intro={intro} />
          <span className="note">{`${risk} at risk, ${late} delayed`}</span></dd></div>
        <div className="kpi"><dt>Due in the next 90 days</dt><dd><CountUp to={due90} fmt={int} intro={intro} />
          <span className="note">{overdue ? `${overdue} more already overdue` : 'None overdue'}</span></dd></div>
        {OPEX ? <div className="kpi"><dt>Savings realised</dt><dd><CountUp to={real} fmt={idr} intro={intro} />
          <span className="note">{target ? `${pct}% of ${idr(target)} target` : 'No savings targets set'}</span>
          <div className="meter" role="img" aria-label={`${pct}% of savings target realised`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div></dd></div> : null}
      </dl>

      <div className="grid3">
        {OPEX ? <div className={'panel' + cls}>
          <h3>Savings by site</h3>
          {rows.length ? <>
            <div className="bars">
              {rows.map(([name, s]) => (
                <div className="barrow" key={name} tabIndex={0}
                  data-tip={`${name}\n${idr(s.r)} realised of ${idr(s.t)} target${s.t ? ' (' + Math.round(s.r / s.t * 100) + '%)' : ''}\n${plural(s.n, 'initiative', 'initiatives')}`}>
                  <span>{name}</span>
                  <div className="bar"><div className="t" style={{ width: `${s.t / max * 100}%` }} /><div className="r" style={{ width: `${s.r / max * 100}%` }} /></div>
                  <span className="v">{`${idr(s.r)} of ${idr(s.t)}`}</span>
                </div>
              ))}
            </div>
            <div className="key"><span><i className="k-r" />Realised</span><span><i className="k-t" />Target</span></div>
          </> : <p className="hint">No project has a savings target yet. Add one to an Opex initiative to see it here.</p>}
        </div> : null}

        <div className="panel">
          <h3>Due next</h3>
          {next.length ? (
            <ul className="rowlist">
              {next.map(p => {
                const n = days(p.target_date);
                return (
                  <li key={p.id}>
                    <button className="link" type="button" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }} onClick={() => openDialog(p)}>
                      <StatusIcon status={p.status} />
                      <span className="grow"><span className="t1">{p.name}</span><span className="t2">{`${p.code}, ${p.stage}`}</span></span>
                      <span className="right">{fmtDate(p.target_date)}<br /><span className={n < 0 ? 'late' : ''}>{due(p.target_date)}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="hint">No open project has a target date.</p>}
        </div>

        <div className="panel">
          <h3>Recent changes</h3>
          {activity.length ? (
            <ul className="rowlist">
              {activity.slice(0, 8).map((a, i) => (
                <li key={i}>
                  <span className="grow"><span className="t1"><b>{a.project_code}</b> {a.action}</span></span>
                  <span className="right">{ago(a.ts)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="hint">Changes made by anyone on the team appear here.</p>}
        </div>
      </div>
    </>
  );
}
