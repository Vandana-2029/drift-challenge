// Re-planning after a break, and the welcome-back screen.
// Re-planning moves the start date so you continue from the first unfinished day,
// and records the shift so the lost days stay visible on the Drift page.
import { load, save } from './store.js';
import { allTasks, isBufferTask, dayNumber, startDate, totalDays } from './plan.js';
import { computeDrift } from './drift.js';
import { isDone } from './store.js';
import { addDays, diffDays, todayISO, fmtDate, esc, plural } from './utils.js';
import { firstName } from './session.js';

/** First plan day that still has unfinished (non catch-up) work. */
export function firstUnfinishedDay() {
  const open = allTasks().filter(t => !isBufferTask(t) && !isDone(t.id)).map(t => t.day);
  return open.length ? Math.min(...open) : totalDays();
}

/**
 * The day to continue from when re-planning: move the dates by exactly the current drift,
 * so the re-plan matches what the Drift page shows.
 */
export function replanTarget() {
  const n = Math.min(dayNumber(), totalDays());
  return Math.max(1, n - computeDrift().shift);
}

/** How many days the plan would move if today became day n. */
export function shiftFor(n) {
  const newStart = addDays(todayISO(), -(n - 1));
  return diffDays(startDate(), newStart);
}

export function replanTo(n, reason = 'Back after a break') {
  const s = load();
  const days = shiftFor(n);
  if (days <= 0) return 0;
  s.startDate = addDays(s.startDate, days);
  s.shifts.push({ on: todayISO(), days, reason, toDay: n });
  save();
  return days;
}

export function undoLastShift() {
  const s = load();
  const last = s.shifts.pop();
  if (!last) return null;
  s.startDate = addDays(s.startDate, -last.days);
  save();
  return last;
}

/** Show the welcome-back dialog if she has been away 3+ days. */
export function maybeWelcome(rerender) {
  const s = load();
  const today = todayISO();
  if (!s.lastActive || s.welcomeShown === today) return;
  const away = diffDays(s.lastActive, today);
  const n = dayNumber();
  if (away < 3 || n < 2) return;
  s.welcomeShown = today;
  save();

  const drift = computeDrift();
  const target = replanTarget();
  const shift = shiftFor(target);
  const first = firstUnfinishedDay();

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="wb-title">
    <h2 id="wb-title">Welcome back, ${esc(firstName())}</h2>
    <p>You were away for ${plural(away - 1, 'day')}. That happens to everyone. What matters is that you opened this today.</p>
    <div class="banner ${drift.days >= 5 ? 'bad' : 'warn'}" style="margin:10px 0">
      <strong>Your big goal has drifted ${drift.days.toFixed(1)} days.</strong>
      <div class="small">Your oldest unfinished task is from Day ${first}.</div>
    </div>
    <p class="small">Choose how to restart. Don't try to do double the work today.</p>
    <div class="stack">
      <button class="btn primary" data-wb="replan" style="width:100%">Re-plan: move my dates ${plural(shift, 'day')} (today becomes Day ${target})</button>
      <button class="btn" data-wb="keep" style="width:100%">Keep the plan: do today's tasks, clear the backlog on catch-up days</button>
      <button class="btn" data-wb="min" style="width:100%">Just do a Minimum Day today</button>
    </div>
    <p class="tiny" style="margin-top:10px">Re-planning is recorded, so the Drift page still shows the days you lost. That's the honest way to restart.</p>
  </div>`;
  document.body.appendChild(back);
  back.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wb]');
    if (!b && e.target !== back) return;
    const choice = b?.dataset.wb;
    if (choice === 'replan') replanTo(target);
    back.remove();
    if (choice === 'min') location.hash = '#/today';
    rerender();
  });
}

export function shiftSummary() {
  const s = load();
  if (!s.shifts.length) return '';
  return s.shifts.map(x => `${fmtDate(x.on)}: moved ${plural(x.days, 'day')} (${esc(x.reason)})`).join('<br>');
}
