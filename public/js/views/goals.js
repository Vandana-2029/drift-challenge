// BIG GOALS: the final outcome, phases, milestone checklists (some auto-tracked) and your own goals.
import { plan, allTasks, isBufferTask, dayNumber, totalDays } from '../plan.js';
import { load, save, isDone, touch } from '../store.js';
import { computeDrift, projection, streaks } from '../drift.js';
import { esc, fmtDate, pct, uid } from '../utils.js';
import { trackChip } from '../components.js';
import { trackOrder, track } from '../plan.js';
import { bar } from '../components.js';

/** Live values for milestone items that have a metric. */
export function metrics() {
  const s = load();
  const done = allTasks().filter(t => isDone(t.id));
  return {
    leetcodeSolved: done.filter(t => t.leetcode).length + (s.lcExtra || 0),
    daysShowedUp: streaks().showed,
    applications: s.apps.length,
    mockInterviews: s.mocks.filter(m => m.type === 'interview').length,
    projectsOnGithub: null, // manual
  };
}

export function render(root, ctx) {
  const s = load();
  if (!s.customGoals) s.customGoals = [];
  const drift = computeDrift();
  const m = metrics();
  const tasks = allTasks().filter(t => !isBufferTask(t));
  const doneAll = tasks.filter(t => isDone(t.id)).length;
  const n = Math.max(0, Math.min(totalDays(), dayNumber() - 1));
  const dueSoFar = tasks.filter(t => t.day <= n).length;
  const end = projection(totalDays(), drift);

  const phaseCards = plan().phases.map(p => {
    const pt = tasks.filter(t => t.day >= p.startDay && t.day <= p.endDay);
    const pd = pt.filter(t => isDone(t.id)).length;
    const pr = projection(p.endDay, drift);
    return `<div class="card">
      <div class="card-head"><h3>Phase ${p.id}: ${esc(p.name)}</h3><span class="tiny">Days ${p.startDay}–${p.endDay}</span></div>
      <p class="small muted">${esc(p.goal)}</p>
      ${bar(pct(pd, pt.length), 'brand')}
      <p class="tiny" style="margin-top:6px">${pd} of ${pt.length} tasks · ends ${fmtDate(pr.projected)}${pr.lateBy > 0 ? ` <span class="warn-ink">(+${pr.lateBy}d)</span>` : ''}</p>
    </div>`;
  }).join('');

  const milestoneCards = plan().milestones.map(ms => {
    const pr = projection(ms.day, drift);
    const items = ms.items.map(it => {
      if (it.metric && m[it.metric] !== null && m[it.metric] !== undefined) {
        const cur = m[it.metric];
        const ok = cur >= it.target;
        return `<div class="checkline" style="cursor:default">
          <input type="checkbox" disabled ${ok ? 'checked' : ''} aria-label="auto-tracked">
          <div style="flex:1"><div>${trackChip(it.track)} ${esc(it.text)}</div>
          <div class="row" style="margin-top:4px"><div style="flex:1">${bar(pct(cur, it.target), ok ? '' : 'brand')}</div><span class="tiny">${cur} / ${it.target} · auto</span></div></div>
        </div>`;
      }
      return `<label class="checkline"><input type="checkbox" data-ms="${esc(it.id)}" ${s.milestones[it.id] ? 'checked' : ''}>
        <span>${trackChip(it.track)} ${esc(it.text)}</span></label>`;
    }).join('');
    const ticked = ms.items.filter(it => (it.metric && m[it.metric] != null) ? m[it.metric] >= it.target : s.milestones[it.id]).length;
    const p = pct(ticked, ms.items.length);
    return `<div class="card">
      <div class="card-head">
        <h2>${esc(ms.title)}</h2>
        <span class="small ${pr.lateBy > 0 ? 'warn-ink' : 'muted'}">${fmtDate(pr.projected)}${pr.lateBy > 0 ? ` · ${pr.lateBy}d late` : ''}</span>
      </div>
      <div class="row" style="margin-bottom:6px"><div style="flex:1">${bar(p, p >= 70 ? '' : 'brand')}</div><span class="small">${p}% ${p >= 70 ? '· pass ✓' : '(70% = pass)'}</span></div>
      ${items}
    </div>`;
  }).join('');

  const trackRows = trackOrder().map(t => {
    const tt = tasks.filter(x => x.track === t);
    if (!tt.length) return '';
    const d = tt.filter(x => isDone(x.id)).length;
    const due = tt.filter(x => x.day <= n).length;
    const dueDone = tt.filter(x => x.day <= n && isDone(x.id)).length;
    return `<tr><td>${trackChip(t)} ${esc((track(t)?.name || t))}</td><td style="width:40%">${bar(pct(d, tt.length), 'brand')}</td>
      <td class="small">${d} / ${tt.length}</td><td class="small ${dueDone < due ? 'warn-ink' : 'good-ink'}">${due ? `${dueDone}/${due} due so far` : '—'}</td></tr>`;
  }).join('');

  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>Big Goals</h1><p>The finish line, and every checkpoint on the way.</p></div>

    <div class="banner info">
      <div class="row between">
        <div style="flex:1;min-width:240px">
          <h2>${esc(plan().meta.title)}</h2>
          <p class="small">${esc(plan().meta.summary || [plan().meta.answers?.goals?.d90, plan().meta.answers?.goals?.d60, plan().meta.answers?.goals?.d30].find(Boolean) || '')}</p>
        </div>
        <div style="text-align:right">
          <div class="big-number">${pct(doneAll, tasks.length)}%</div>
          <div class="tiny">${doneAll} of ${tasks.length} tasks · finish ${fmtDate(end.projected)}</div>
        </div>
      </div>
      <div style="margin-top:10px">${bar(pct(doneAll, tasks.length), 'brand')}</div>
      ${dueSoFar ? `<p class="tiny" style="margin-top:6px">Due so far: ${dueSoFar} tasks · you've done ${tasks.filter(t => t.day <= n && isDone(t.id)).length} of them.</p>` : ''}
    </div>

    <div class="grid grid-3">${phaseCards}</div>

    ${milestoneCards}

    <div class="card">
      <h2>Progress by track</h2>
      <div class="table-wrap"><table><tbody>${trackRows}</tbody></table></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>My own goals</h2><span class="tiny">e.g. “Pass my first mock interview”, “Run 5 km without stopping”</span></div>
      <div id="custom">
        ${s.customGoals.map(g => `<div class="checkline" style="align-items:center">
          <input type="checkbox" data-cg="${g.id}" ${g.done ? 'checked' : ''}>
          <span style="flex:1;${g.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${esc(g.text)}</span>
          <button class="btn sm danger" data-cg-del="${g.id}" aria-label="Delete goal">✕</button></div>`).join('') || '<p class="empty">No personal goals yet.</p>'}
      </div>
      <form id="cg-form" class="row" style="margin-top:10px">
        <input name="text" placeholder="Add a goal…" required style="flex:1;min-width:200px">
        <button class="btn primary" type="submit">Add</button>
      </form>
    </div>
  </div>`;

  root.querySelectorAll('[data-ms]').forEach(cb => cb.addEventListener('change', () => {
    s.milestones[cb.dataset.ms] = cb.checked; touch(); ctx.rerender();
  }));
  root.querySelectorAll('[data-cg]').forEach(cb => cb.addEventListener('change', () => {
    const g = s.customGoals.find(x => x.id === cb.dataset.cg); g.done = cb.checked; touch(); ctx.rerender();
  }));
  root.querySelectorAll('[data-cg-del]').forEach(b => b.addEventListener('click', () => {
    s.customGoals = s.customGoals.filter(x => x.id !== b.dataset.cgDel); save(); ctx.rerender();
  }));
  root.querySelector('#cg-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = new FormData(e.target).get('text').trim();
    if (!text) return;
    s.customGoals.push({ id: uid(), text, done: false }); touch(); ctx.rerender();
  });
}
