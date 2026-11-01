// Reusable HTML pieces.
import { getTask } from './store.js';
import { track } from './plan.js';
import { esc } from './utils.js';

const ICON = { done: '✓', done_with_help: '✓', skipped: '–' };
const CLS = { done: 'on', done_with_help: 'help', skipped: 'skip' };
const FALLBACK = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#ca8a04', '#db2777', '#0891b2'];

export function trackChip(id) {
  if (id === 'ALL') return '<span class="chip track" style="background:#64748b">All</span>';
  const t = track(id);
  const color = t?.color || FALLBACK[(id || '').length % FALLBACK.length];
  return `<span class="chip track" style="background:${esc(color)}">${esc(t?.name || id)}</span>`;
}

/** One task row with a big tick box and a small status menu. */
export function taskRow(t, { showDay = false } = {}) {
  const st = getTask(t.id).status;
  const rowCls = st === 'skipped' ? 'skipped' : (st === 'done' || st === 'done_with_help') ? 'done' : '';
  const link = t.link ? ` <a href="${esc(t.link)}" target="_blank" rel="noopener">open ↗</a>` : '';
  return `
  <div class="task ${rowCls}" data-task="${esc(t.id)}">
    <button class="check ${CLS[st] || ''}" data-act="toggle" aria-label="Mark done" title="Mark done">${ICON[st] || ''}</button>
    <div>
      <div class="t-title">${esc(t.title)}${link}</div>
      <div class="t-meta">
        ${trackChip(t.track)}
        <span class="tiny">${t.minutes} min</span>
        ${showDay ? `<span class="tiny">· Day ${t.day}</span>` : ''}
        ${t.priority === 'stretch' ? '<span class="chip stretch">stretch</span>' : ''}
        ${st === 'done_with_help' ? '<span class="tiny">done with help</span>' : ''}
      </div>
    </div>
    <div class="status-menu">
      <button data-act="help" class="${st === 'done_with_help' ? 'on' : ''}" title="Done after looking at hints or a solution">with help</button>
      <button data-act="skip" class="${st === 'skipped' ? 'on' : ''}" title="Skip on purpose (still counts as drift)">skip</button>
    </div>
  </div>`;
}

/** Wire up clicks on task rows inside a container. */
export function bindTaskRows(root, onChange, setStatus) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('[data-task]');
    if (!btn || !row || !root.contains(row)) return;
    const act = btn.dataset.act;
    if (!['toggle', 'help', 'skip'].includes(act)) return;
    const id = row.dataset.task;
    const cur = getTask(id).status;
    let next = cur;
    if (act === 'toggle') next = (cur === 'not_started' || cur === 'skipped') ? 'done' : 'not_started';
    if (act === 'help') next = cur === 'done_with_help' ? 'not_started' : 'done_with_help';
    if (act === 'skip') next = cur === 'skipped' ? 'not_started' : 'skipped';
    setStatus(id, next);
    onChange(id, next);
  });
}

export function bar(percent, cls = '') {
  return `<div class="bar ${cls}" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div>`;
}

export function stat(label, value, sub = '') {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
