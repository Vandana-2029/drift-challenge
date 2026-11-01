// ALL DAYS: heatmap of all days, plus a detail page for any single day (#/plan/12).
import { plan, getPlanDay, dateOf, dayNumber, phaseOf, totalDays } from '../plan.js';
import { getDay, isDone, getTask, setTaskStatus } from '../store.js';
import { showedUpDates } from '../drift.js';
import { esc, fmtDate, pct, todayISO } from '../utils.js';
import { trackOrder } from '../plan.js';
import { taskRow, bindTaskRows, bar } from '../components.js';
import { overdueTasks } from './today.js';

function level(p) {
  if (p === 0) return 0;
  if (p < 40) return 1;
  if (p < 70) return 2;
  if (p < 100) return 3;
  return 4;
}

function renderGrid(root, ctx) {
  const today = dayNumber();
  const showed = showedUpDates();
  const cells = plan().days.map(d => {
    const done = d.tasks.filter(t => isDone(t.id)).length;
    const p = pct(done, d.tasks.length);
    const date = dateOf(d.day);
    const missed = date < todayISO() && !showed.has(date) && d.type !== 'rest';
    const cls = [d.type === 'rest' ? 'rest' : '', d.type === 'catchup' ? 'catchup' : '', d.type === 'review' ? 'review' : '', d.day === today ? 'today' : '', missed ? 'missed' : ''].join(' ');
    return `<button data-l="${level(p)}" class="${cls}" data-day="${d.day}" title="Day ${d.day} · ${fmtDate(date)} · ${esc(d.theme)} · ${p}% done">${d.day}</button>`;
  }).join('');
  const overdue = today > 1 ? overdueTasks(Math.min(today, totalDays() + 1)).filter(t => getTask(t.id).status === 'not_started') : [];
  const byDay = {};
  overdue.forEach(t => { (byDay[t.day] ||= []).push(t); });

  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>All ${totalDays()} days</h1><p>Every day of your challenge. Tap a day to open it.</p></div>
    <div class="card">
      <div class="heat">${cells}</div>
      <div class="legend" style="margin-top:12px">
        <span><i style="background:var(--heat-0)"></i>Not started</span>
        <span><i style="background:var(--heat-2)"></i>Partly done</span>
        <span><i style="background:var(--heat-4)"></i>All done</span>
        <span><i style="outline:2px dashed var(--border);outline-offset:-2px"></i>Catch-up</span>
        <span><i style="background:repeating-linear-gradient(45deg,var(--heat-0),var(--heat-0) 3px,var(--surface) 3px,var(--surface) 6px)"></i>Rest</span>
        <span><i style="outline:2px solid var(--accent);outline-offset:-2px"></i>Milestone review</span>
        <span><i style="background:var(--bad);border-radius:50%;width:8px;height:8px"></i>Missed (nothing done)</span>
      </div>
    </div>
    <div class="grid grid-3">
      ${plan().phases.map(p => `<div class="card"><h3>${esc(p.name)}</h3><p class="tiny">Days ${p.startDay}–${p.endDay} · ${fmtDate(dateOf(p.startDay), { weekday: false })} – ${fmtDate(dateOf(p.endDay), { weekday: false })}</p><p class="small muted">${esc(p.goal)}</p></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-head"><h2>All overdue tasks (${overdue.length})</h2><span class="tiny">Finish these on catch-up days to pull your finish date back.</span></div>
      <div id="overdue-all">
        ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, ts]) => `
          <details ${Number(d) >= today - 7 ? 'open' : ''} style="margin-top:6px">
            <summary>Day ${d} · ${fmtDate(dateOf(Number(d)))} · ${ts.length} left</summary>
            <div>${ts.map(t => taskRow(t)).join('')}</div>
          </details>`).join('') : '<p class="empty">Nothing overdue.</p>'}
      </div>
    </div>
  </div>`;

  root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { location.hash = `#/plan/${b.dataset.day}`; }));
  bindTaskRows(root.querySelector('#overdue-all'), () => ctx.rerender(), setTaskStatus);
}

function renderDay(root, ctx, n) {
  const d = getPlanDay(n);
  const rec = getDay(n);
  const tasks = [...d.tasks].sort((a, b) => trackOrder().indexOf(a.track) - trackOrder().indexOf(b.track));
  const done = tasks.filter(t => isDone(t.id)).length;
  const phase = phaseOf(n);
  const wins = (rec.wins || []).filter(Boolean);
  root.innerHTML = `
  <div class="stack">
    <div class="row between">
      <a class="btn sm" href="#/plan">← All days</a>
      <div class="row">
        <a class="btn sm" href="#/plan/${n - 1}" ${n <= 1 ? 'style="visibility:hidden"' : ''}>← Day ${n - 1}</a>
        <a class="btn sm" href="#/plan/${n + 1}" ${n >= totalDays() ? 'style="visibility:hidden"' : ''}>Day ${n + 1} →</a>
      </div>
    </div>
    <div class="page-head">
      <h1>Day ${n}${n === dayNumber() ? ' <span class="chip">today</span>' : ''}</h1>
      <p>${fmtDate(dateOf(n), { year: true })} · ${esc(phase.name)} · ${esc(d.theme)}${d.type !== 'normal' ? ` · ${({ catchup: 'Catch-up day', review: 'Milestone review', rest: 'Rest day' })[d.type]}` : ''}</p>
    </div>
    <div class="card">
      <div class="card-head"><h2>Tasks</h2><span class="muted small">${done} of ${tasks.length} done</span></div>
      ${bar(pct(done, tasks.length))}
      <div id="day-tasks" style="margin-top:6px">${tasks.map(t => taskRow({ ...t, day: n })).join('')}</div>
      ${d.grammarTopic ? `<p class="tiny" style="margin-top:8px">Grammar topic this week: ${esc(d.grammarTopic)}</p>` : ''}
    </div>
    <div class="card">
      <h2>Reflection</h2>
      ${wins.length ? `<ul>${wins.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="muted small">No wins written for this day.</p>'}
      ${rec.energy ? `<p class="small">Energy: ${esc(rec.energy)}</p>` : ''}
      ${rec.notes ? `<p style="white-space:pre-wrap">${esc(rec.notes)}</p>` : ''}
      ${n === dayNumber() ? '<a class="btn sm" href="#/today">Edit on Today</a>' : ''}
    </div>
  </div>`;
  bindTaskRows(root.querySelector('#day-tasks'), () => ctx.rerender(), setTaskStatus);
}

export function render(root, ctx) {
  const n = Number(ctx.params[0]);
  if (n >= 1 && n <= totalDays()) renderDay(root, ctx, n);
  else renderGrid(root, ctx);
}
