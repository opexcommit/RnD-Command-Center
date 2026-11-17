// Opex is hidden for now. Set to true to bring back the Opex track, pipeline toggle, type choice and savings figures.
export const OPEX = false;

export const stageSet =type => type === 'Opex' ? 'opex' : 'npd';

export function idr(n) {
  n = +n || 0;
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(n >= 1e10 ? 1 : 2).replace(/\.?0+$/, '') + ' bn';
  if (n >= 1e6) return 'Rp ' + Math.round(n / 1e6) + ' mn';
  return 'Rp ' + Math.round(n).toLocaleString('en-US');
}
export function parseDay(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }
export function days(d) {
  if (!d) return null;
  const t = new Date();
  return Math.round((parseDay(d) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
}
export const fmtDate = d => d ? parseDay(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date';
export function due(d) {
  const n = days(d);
  if (n == null) return '';
  if (n < 0) return -n + (n === -1 ? ' day' : ' days') + ' overdue';
  if (n === 0) return 'due today';
  return 'in ' + n + (n === 1 ? ' day' : ' days');
}
export function ago(ts) {
  const s = (Date.now() - Date.parse(ts)) / 1000;
  if (!(s >= 0) || s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

export function getKey() { try { return localStorage.getItem('rnd-edit-key') || ''; } catch { return ''; } }
export function setKey(v) { try { v ? localStorage.setItem('rnd-edit-key', v) : localStorage.removeItem('rnd-edit-key'); } catch { /* private mode: key lasts for this page only */ } }

export async function api(method, path, body, raw) {
  const headers = {};
  const key = getKey();
  if (key && method !== 'GET') headers['X-Edit-Key'] = key;
  const opt = { method, headers };
  if (raw != null) { opt.body = raw; headers['Content-Type'] = 'text/csv; charset=utf-8'; }
  else if (body) { opt.body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, opt);
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : await r.text();
  if (!r.ok) {
    const e = new Error((isJson && data.error) || r.statusText || 'Request failed');
    e.status = r.status; e.data = data;
    throw e;
  }
  return data;
}
