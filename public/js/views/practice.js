// PRACTICE: log practice tests / mock interviews with scores, see the trend and your most common weak topics.
import { allTasks } from '../plan.js';
import { load, save, touch, isDone } from '../store.js';
import { esc, fmtDate, todayISO, uid, pct, toast } from '../utils.js';
import { stat } from '../components.js';

const TYPES = [
  { id: 'test', label: 'Practice test / quiz' },
  { id: 'aptitude', label: 'Aptitude test' },
  { id: 'coding', label: 'Coding test' },
  { id: 'interview', label: 'Mock interview' },
  { id: 'other', label: 'Other' },
];

function trend(mocks) {
  const pts = mocks.filter(m => m.total > 0 && m.type !== 'interview').sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return '<p class="empty">Log 2 or more scored tests to see your trend.</p>';
  const W = 640, H = 180, L = 36, R = 12, T = 12, B = 24;
  const x = i => L + (i / (pts.length - 1)) * (W - L - R);
  const y = v => T + ((100 - v) / 100) * (H - T - B);
  const vals = pts.map(m => pct(m.score, m.total));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mock scores over time" style="width:100%;height:auto">
    ${[0, 50, 100].map(v => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
    <polyline points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--accent)"><title>${fmtDate(pts[i].date)}: ${v}%</title></circle>`).join('')}
    <text x="${L}" y="${H - 6}">${fmtDate(pts[0].date, { weekday: false })}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDate(pts[pts.length - 1].date, { weekday: false })}</text>
  </svg>`;
}

export function render(root, ctx) {
  const s = load();
  const lcPlan = allTasks().filter(t => t.leetcode && isDone(t.id)).length;
  const mocks = [...s.mocks].sort((a, b) => b.date.localeCompare(a.date));
  const scored = mocks.filter(m => m.total > 0 && m.type !== 'interview');
  const best = scored.length ? Math.max(...scored.map(m => pct(m.score, m.total))) : null;
  const last = scored[0] ? pct(scored[0].score, scored[0].total) : null;
  const weak = {};
  mocks.forEach(m => (m.weak || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean).forEach(w => { weak[w] = (weak[w] || 0) + 1; }));
  const weakList = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 8);

  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>Practice</h1><p>Test scores and weak topics, so you know exactly what to revise.</p></div>

    <div class="grid grid-4">
      ${stat('Extra practice', (s.lcExtra || 0) + lcPlan, 'counter below')}
      ${stat('Tests taken', mocks.filter(m => m.type !== 'interview').length, 'with scores')}
      ${stat('Mock interviews', mocks.filter(m => m.type === 'interview').length, 'practise out loud')}
      ${stat('Latest score', last === null ? '—' : last + '%', best === null ? 'no scored mocks yet' : `best ${best}%`)}
    </div>

    <div class="card">
      <div class="card-head"><h2>Extra practice counter</h2><span class="tiny">Problems, exercises or drills you did that aren't plan tasks</span></div>
      <div class="row">
        <button class="btn" data-lc="-1" aria-label="Remove one">−1</button>
        <span class="big-number" style="min-width:60px;text-align:center">${s.lcExtra || 0}</span>
        <button class="btn primary" data-lc="1">+1 solved</button>
      </div>
    </div>

    <div class="card">
      <h2>Log a test</h2>
      <form id="mock-form" class="form-grid">
        <label class="field">Date<input type="date" name="date" value="${todayISO()}"></label>
        <label class="field">Type<select name="type">${TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}</select></label>
        <label class="field">Score<input type="number" name="score" min="0" placeholder="e.g. 42"></label>
        <label class="field">Out of<input type="number" name="total" min="0" placeholder="e.g. 65"></label>
        <label class="field" style="grid-column:1/-1">Weak topics (comma separated)<input name="weak" placeholder="e.g. recursion, past tense, time management"></label>
        <label class="field" style="grid-column:1/-1">Notes<input name="notes" placeholder="What went wrong? What will you change next time?"></label>
        <button class="btn primary" type="submit">Save</button>
      </form>
    </div>

    <div class="grid grid-2">
      <div class="card"><h2>Score trend</h2>${trend(s.mocks)}</div>
      <div class="card">
        <h2>Revise these next</h2>
        ${weakList.length ? `<ul class="clean">${weakList.map(([w, c]) => `<li class="row between"><span>${esc(w)}</span><span class="chip">${c}×</span></li>`).join('')}</ul>
          <p class="tiny" style="margin-top:6px">Your most-repeated weak topics. Revise these first.</p>`
          : '<p class="empty">Weak topics you log with each mock show up here.</p>'}
      </div>
    </div>

    <div class="card">
      <h2>History</h2>
      ${mocks.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Type</th><th>Score</th><th>Weak topics</th><th>Notes</th><th></th></tr></thead>
        <tbody>${mocks.map(m => `<tr>
          <td class="small">${fmtDate(m.date, { weekday: false })}</td>
          <td class="small">${esc(TYPES.find(t => t.id === m.type)?.label || m.type)}</td>
          <td>${m.total ? `<strong>${pct(m.score, m.total)}%</strong> <span class="tiny">${m.score}/${m.total}</span>` : '—'}</td>
          <td class="small">${esc(m.weak || '')}</td>
          <td class="small">${esc(m.notes || '')}</td>
          <td><button class="btn sm danger" data-del="${m.id}" aria-label="Delete">✕</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No tests logged yet. Timed practice tests are the fastest way to find weak spots.</p>'}
    </div>
  </div>`;

  root.querySelectorAll('[data-lc]').forEach(b => b.addEventListener('click', () => {
    s.lcExtra = Math.max(0, (s.lcExtra || 0) + Number(b.dataset.lc)); touch(); ctx.rerender();
  }));
  root.querySelector('#mock-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    s.mocks.push({ id: uid(), date: f.date || todayISO(), type: f.type, score: Number(f.score) || 0, total: Number(f.total) || 0, weak: f.weak.trim(), notes: f.notes.trim() });
    touch(); toast('Saved. Reviewing mistakes is where the marks come from.'); ctx.rerender();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Delete this entry?')) return;
    s.mocks = s.mocks.filter(m => m.id !== b.dataset.del); save(); ctx.rerender();
  }));
}
