// TODAY: tasks for today's plan day, how much energy you have, the Minimum Day checklist, overdue tasks and reflection.
import { plan, dayNumber, currentDay, getPlanDay, phaseOf, allTasks, isBufferTask, dateOf, totalDays, trackOrder } from '../plan.js';
import { getDay, updateDay, setTaskStatus, getTask, isDone } from '../store.js';
import { esc, fmtDate, pct, plural, debounce, toast, todayISO } from '../utils.js';
import { taskRow, bindTaskRows, bar } from '../components.js';
import { minimumComplete } from '../drift.js';

function dayTypes() {
  const h = plan().meta.hours || {};
  const full = h.weekday ? `About ${h.weekday} hours on weekdays${h.weekend != null ? `, ${h.weekend} on weekends` : ''}.` : 'Every task, in order.';
  return [
    { id: 'full', label: 'Full day', hint: `${full} Do every task, starting with the hardest one.` },
    { id: 'normal', label: 'Normal day', hint: 'About two-thirds of the time. Do the first task of each area; whatever is left goes to the next catch-up day.' },
    { id: 'minimum', label: 'Minimum day', hint: 'About 1 hour. Tick the boxes below to keep your streak alive. Bad days still count.' },
  ];
}

const sortTasks = (tasks) => [...tasks].sort((a, b) => trackOrder().indexOf(a.track) - trackOrder().indexOf(b.track));

export function overdueTasks(beforeDay) {
  return allTasks().filter(t => t.day < beforeDay && !isBufferTask(t) && !isDone(t.id));
}

export function render(root, ctx) {
  const n = dayNumber();
  const before = n < 1;
  const after = n > totalDays();
  const dayN = currentDay();
  const pd = getPlanDay(dayN);
  const rec = getDay(dayN);
  const phase = phaseOf(dayN);
  const tasks = sortTasks(pd.tasks);
  const doneCount = tasks.filter(t => isDone(t.id)).length;
  const overdue = before ? [] : overdueTasks(dayN);
  const pending = overdue.filter(t => getTask(t.id).status === 'not_started');
  const skipped = overdue.filter(t => getTask(t.id).status === 'skipped');
  const minItems = plan().meta.minimumDay?.length ? plan().meta.minimumDay : ['One small task (15 minutes)', '30 minutes on your main area', '5 minutes writing what you did'];
  const minDone = minItems.filter((_, i) => rec.minimum?.[i]).length;
  const types = dayTypes();
  const type = types.find(d => d.id === rec.dayType) || types[0];

  let hero = '';
  if (before) {
    hero = `<div class="banner info"><h2>Your challenge starts in ${plural(1 - n, 'day')}</h2>
      <p>Day 1 is ${fmtDate(dateOf(1))}. Here's what it looks like. You can tick things early if you want a head start.</p></div>`;
  } else if (after) {
    hero = `<div class="banner good"><h2>You reached the end of your ${totalDays()} days</h2>
      <p>See what you achieved on Big Goals. Unfinished tasks are still listed below. Ready for the next one? Create a new plan in Settings.</p></div>`;
  }

  root.innerHTML = `
  <div class="stack">
    ${hero}
    <div class="page-head row between">
      <div>
        <h1>Day ${dayN} <span class="muted" style="font-weight:500">of ${totalDays()}</span></h1>
        <p>${fmtDate(dateOf(dayN), { year: true })} · ${esc(phase.name)} · ${esc(pd.theme || '')}</p>
      </div>
      <div class="row">
        <button class="btn sm" data-nav="${dayN - 1}" ${dayN <= 1 ? 'disabled' : ''} aria-label="Previous day">← Day ${Math.max(1, dayN - 1)}</button>
        <a class="btn sm" href="#/plan">All days</a>
      </div>
    </div>

    <div id="drift-strip"></div>

    ${pd.type === 'rest' ? `<div class="banner good"><h3>Rest day</h3><p>No tasks today, by your own plan. Rest properly so you come back fresh. If you want, clear an overdue task below.</p></div>` : ''}
    ${pd.type === 'catchup' ? `<div class="banner warn"><h3>Catch-up day</h3><p>No new work today. Clear the overdue tasks below. Every one you finish pulls your finish date back.</p></div>` : ''}
    ${pd.type === 'review' ? `<div class="banner info"><h3>Milestone review day</h3><p>Open <a href="#/goals">Big Goals</a> and tick off what you achieved. About 70% is a pass, so keep going either way.</p></div>` : ''}

    ${pd.type !== 'rest' ? `
    <div class="card">
      <div class="card-head">
        <h2>How much energy do you have today?</h2>
        <div class="seg" role="group" aria-label="Day type">
          ${types.map(d => `<button data-type="${d.id}" class="${d.id === type.id ? 'on' : ''}">${d.label}</button>`).join('')}
        </div>
      </div>
      <p class="muted small">${esc(type.hint)}</p>
      ${type.id === 'minimum' ? `
        <div style="margin-top:8px">
          ${minItems.map((m, i) => `<label class="checkline"><input type="checkbox" data-min="${i}" ${rec.minimum?.[i] ? 'checked' : ''}> <span>${esc(m)}</span></label>`).join('')}
          <p class="small ${minDone === minItems.length ? 'good-ink' : 'muted'}" style="margin-top:6px">${minDone === minItems.length ? 'Minimum Day done. Today counts.' : `${minDone} of ${minItems.length} done`}</p>
        </div>` : ''}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Today's tasks</h2>
        <span class="muted small">${doneCount} of ${tasks.length} done</span>
      </div>
      ${bar(pct(doneCount, tasks.length))}
      <div style="margin-top:6px" id="today-tasks">${tasks.map(t => taskRow({ ...t, day: dayN })).join('') || '<p class="empty">No tasks today.</p>'}</div>
    </div>` : ''}

    ${overdue.length ? `
    <div class="card">
      <div class="card-head">
        <h2>Overdue <span class="muted" style="font-weight:500">(${pending.length})</span></h2>
        <span class="tiny">Each one adds to your drift. Clear them on catch-up days.</span>
      </div>
      <div id="overdue-tasks">
        ${pending.slice(0, 12).map(t => taskRow(t, { showDay: true })).join('') || '<p class="empty">Nothing overdue. You are on track.</p>'}
      </div>
      ${pending.length > 12 ? `<p class="tiny">${pending.length - 12} more on the <a href="#/plan">Days</a> page.</p>` : ''}
      ${skipped.length ? `<details style="margin-top:8px"><summary>Skipped on purpose (${skipped.length})</summary><div id="skipped-tasks">${skipped.map(t => taskRow(t, { showDay: true })).join('')}</div></details>` : ''}
    </div>` : ''}

    <div class="card">
      <h2>End-of-day reflection</h2>
      <p class="muted small">Write 3 small wins. On bad days, read old wins. They show you're improving.</p>
      <div class="grid grid-3" style="margin-top:8px">
        ${[0, 1, 2].map(i => `<input data-win="${i}" placeholder="Win ${i + 1}" value="${esc(rec.wins?.[i] || '')}">`).join('')}
      </div>
      <div class="form-grid" style="margin-top:10px">
        <label class="field">Energy today
          <select data-energy>
            ${['', 'Low', 'Okay', 'Good', 'Great'].map(e => `<option ${rec.energy === e ? 'selected' : ''} value="${e}">${e || 'Choose'}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="field" style="margin-top:10px">Notes (what I learned, where I got stuck)
        <textarea data-notes placeholder="e.g. Got stuck on the base case; looked at a hint, then rewrote it myself.">${esc(rec.notes || '')}</textarea>
      </label>
    </div>
  </div>`;

  // --- events ---
  root.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { updateDay(dayN, { dayType: b.dataset.type }); ctx.rerender(); }));
  root.querySelectorAll('[data-min]').forEach(cb => cb.addEventListener('change', () => {
    const minimum = { ...(getDay(dayN).minimum || {}), [cb.dataset.min]: cb.checked };
    const complete = minimumComplete({ minimum });
    updateDay(dayN, { minimum, minDoneOn: complete ? (getDay(dayN).minDoneOn || todayISO()) : null });
    if (complete) toast('Minimum Day done. Your streak is safe.');
    ctx.rerender();
  }));
  root.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { location.hash = `#/plan/${b.dataset.nav}`; }));
  const onTask = (id, status) => {
    if (status === 'done' || status === 'done_with_help') {
      const left = tasks.filter(t => !isDone(t.id)).length;
      toast(left === 0 && tasks.length ? 'All of today is done. Brilliant.' : 'Nice. One more step.');
    }
    ctx.rerender();
  };
  ['today-tasks', 'overdue-tasks', 'skipped-tasks'].forEach(id => bindTaskRows(root.querySelector('#' + id), onTask, setTaskStatus));
  const saveWins = debounce(() => updateDay(dayN, { wins: [0, 1, 2].map(i => root.querySelector(`[data-win="${i}"]`).value) }));
  root.querySelectorAll('[data-win]').forEach(i => i.addEventListener('input', saveWins));
  root.querySelector('[data-energy]').addEventListener('change', e => updateDay(dayN, { energy: e.target.value }));
  root.querySelector('[data-notes]').addEventListener('input', debounce(e => updateDay(dayN, { notes: e.target.value })));
  ctx.afterRender?.(root, dayN);
}
