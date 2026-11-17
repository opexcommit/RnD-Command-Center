import { useState } from 'react';
import { stageSet, days, fmtDate, due, api, OPEX } from './lib.js';
import { StatusPill } from './StatusIcon.jsx';

function Card({ p, openDialog, dragging, dragId, setDragId }) {
  const n = days(p.target_date);
  return (
    <article className={'card' + (dragId === p.id ? ' dragging' : '')} draggable="true" tabIndex={0} role="button"
      aria-label={`${p.code} ${p.name}, ${p.status}. Open to edit.`}
      onDragStart={e => { e.dataTransfer.setData('text/plain', String(p.id)); e.dataTransfer.effectAllowed = 'move'; dragging.current = true; setDragId(p.id); }}
      onDragEnd={() => { dragging.current = false; setDragId(null); }}
      onClick={() => openDialog(p)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDialog(p); } }}>
      <div className="code"><span>{p.code}</span><span>{p.type === 'Opex' ? p.site : p.category}</span></div>
      <div className="name">{p.name}</div>
      <div className="meta">
        <StatusPill status={p.status} />
        {p.target_date ? <span style={n < 0 && p.status !== 'Done' ? { color: 'var(--late)', fontWeight: 600 } : undefined}>{p.status === 'Done' ? fmtDate(p.target_date) : due(p.target_date)}</span> : null}
      </div>
      <div className="meta" style={{ marginTop: '4px' }}><span>{p.owner || 'No owner'}</span><span className="num">{p.progress + '%'}</span></div>
      <div className="prog"><i style={{ width: `${p.progress}%` }} /></div>
    </article>
  );
}

export default function Pipeline({ data, openDialog, toast, load, handleErr, pipeSet, setPipeSet, dragging }) {
  const [over, setOver] = useState(null);
  const [dragId, setDragId] = useState(null);
  const stages = data.stages[pipeSet] || [];
  const list = data.projects.filter(p => stageSet(p.type) === pipeSet);

  async function moveTo(id, stage) {
    const p = data.projects.find(x => x.id === id);
    if (!p || p.stage === stage) return;
    try {
      await api('PUT', '/api/projects/' + id, { stage, version: p.version });
      toast(`${p.code} moved to ${stage}`);
      await load(true);
    } catch (e) { handleErr(e); }
  }

  return (
    <>
      <div className="bar-top">
        {OPEX ? <div className="seg" role="group" aria-label="Pipeline">
          <button data-set="npd" aria-pressed={pipeSet === 'npd'} onClick={() => setPipeSet('npd')}>Product development</button>
          <button data-set="opex" aria-pressed={pipeSet === 'opex'} onClick={() => setPipeSet('opex')}>Opex initiatives</button>
        </div> : null}
        <span className="hint">Drag a card to another stage, or open it to edit.</span>
      </div>
      {/* shortcut: HTML5 drag and drop has no touch support; on touch screens open the card and change Stage. Add pointer-event dragging if tablets become the main device. */}
      <div className="board" id="board" style={{ '--n': stages.length || 1 }}>
        {stages.map(st => {
          const items = list.filter(p => p.stage === st).sort((a, b) => (a.target_date || '9').localeCompare(b.target_date || '9'));
          return (
            <div key={st} className={'col' + (over === st ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(st); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
              onDrop={e => { e.preventDefault(); setOver(null); dragging.current = false; moveTo(+e.dataTransfer.getData('text/plain'), st); }}>
              <div className="col-head"><h3>{st}</h3><span className="gate-n">{items.length}</span></div>
              {items.length
                ? items.map(p => <Card key={p.id} p={p} openDialog={openDialog} dragging={dragging} dragId={dragId} setDragId={setDragId} />)
                : <p className="hint" style={{ margin: '4px' }}>Nothing at this stage</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
