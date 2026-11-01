// DRIFT ENGINE
// Turns unfinished work into "days your big goal moves back".
//
//   required  = minutes of every task on days that are already over (catch-up days are buffers, not counted)
//   done      = minutes of tasks you finished from those days + anything you finished early from future days
//   backlog   = required - done
//   drift     = backlog / minutes in a typical day      (> 0 = behind, < 0 = ahead)
//
// Today's own tasks never count against you until the day is over.
import { plan, allTasks, isBufferTask, dayNumber, dateOf, startDate, getPlanDay, totalDays } from './plan.js';
import { load, DONE_STATUSES } from './store.js';
import { addDays, diffDays, todayISO, parseISO } from './utils.js';

let CAP = null;

/** Drift below this (about 1 hour of work) counts as on track. */
export const BEHIND = 0.25;

/** Average minutes of planned work on a normal (non catch-up, non review) day. */
export function dailyCapacity() {
  if (CAP) return CAP;
  const normal = plan().days.filter(d => d.type === 'normal' && d.tasks.length);
  const total = normal.reduce((s, d) => s + d.tasks.reduce((a, t) => a + t.minutes, 0), 0);
  CAP = Math.max(30, Math.round(total / Math.max(1, normal.length)));
  return CAP;
}

/** Call when the plan changes. */
export function resetCaches() { CAP = null; }

/** True when every Minimum Day item was ticked for that day record. */
export function minimumComplete(dayRec) {
  const n = plan()?.meta.minimumDay?.length || 3;
  const m = dayRec?.minimum || {};
  for (let i = 0; i < n; i++) if (!m[i]) return false;
  return true;
}

function doneBy(taskId, asOf) {
  const rec = load().tasks[taskId];
  return rec && DONE_STATUSES.has(rec.status) && rec.at <= asOf;
}

/** Drift as of a given date (default: today). */
export function computeDrift(asOf = todayISO()) {
  const n = dayNumber(asOf);
  const cap = dailyCapacity();
  let required = 0, donePast = 0, doneAhead = 0;
  const byTrack = {};
  for (const t of allTasks()) {
    if (isBufferTask(t)) continue;
    const finished = doneBy(t.id, asOf);
    if (t.day < n) {
      required += t.minutes;
      if (finished) donePast += t.minutes;
      else byTrack[t.track] = (byTrack[t.track] || 0) + t.minutes;
    } else if (t.day > n && finished) {
      doneAhead += t.minutes;
    }
  }
  const backlog = required - donePast - doneAhead;
  const days = backlog / cap;
  return {
    dayNumber: n,
    required, donePast, doneAhead, backlog,
    days,                                     // can be negative (ahead)
    shift: days > BEHIND ? Math.max(1, Math.round(days)) : 0, // whole days the finish date moves
    byTrack,
    cap,
  };
}

/** Total days the plan was re-based ("I restarted after a break"). */
export function shiftedDays() {
  return load().shifts.reduce((s, x) => s + x.days, 0);
}

/** Original and projected calendar date for plan day m. */
export function projection(m, drift = computeDrift()) {
  const original = addDays(plan().meta.startDate, m - 1);
  const planned = dateOf(m);                       // includes re-plans
  const projected = addDays(planned, drift.shift);
  return { original, planned, projected, lateBy: diffDays(original, projected) };
}

/** Dates she showed up: finished at least 1 task, or completed a Minimum Day. */
export function showedUpDates() {
  const s = load();
  const set = new Set();
  for (const rec of Object.values(s.tasks)) if (DONE_STATUSES.has(rec.status)) set.add(rec.at);
  for (const [n, d] of Object.entries(s.days)) {
    if (minimumComplete(d)) set.add(d.minDoneOn || dateOf(Number(n))); // date it was done, so re-plans don't move it
  }
  return set;
}

export function streaks(asOf = todayISO()) {
  const set = showedUpDates();
  // current: count back from today; if today isn't done yet, start from yesterday
  let cur = 0;
  let d = set.has(asOf) ? asOf : addDays(asOf, -1);
  const first = [startDate(), plan().meta.startDate].sort()[0]; // count from the original start, even after re-plans
  while (set.has(d) && d >= first) { cur++; d = addDays(d, -1); }
  // longest
  let best = 0, run = 0;
  const end = asOf;
  for (let x = first; x <= end; x = addDays(x, 1)) {
    run = set.has(x) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // showed-up days inside the challenge window
  const last = addDays(startDate(), totalDays() - 1);
  let showed = 0, missed = 0;
  for (let x = first; x <= asOf && x <= last; x = addDays(x, 1)) {
    if (set.has(x)) showed++;
    else if (x < asOf) missed++;
  }
  return { current: cur, longest: best, showed, missed };
}

/** Drift for each past day, for the chart. */
export function driftHistory(asOf = todayISO()) {
  const out = [];
  const start = startDate();
  const n = dayNumber(asOf);
  if (n < 2) return out;
  const last = Math.min(n, totalDays() + 30);
  for (let i = 1; i <= last; i++) {
    const date = addDays(start, i - 1);
    out.push({ day: i, date, drift: computeDrift(date).days });
  }
  return out;
}

/** The next catch-up day after today, if any. */
export function nextCatchup(asOf = todayISO()) {
  const n = dayNumber(asOf);
  for (let i = Math.max(1, n); i <= totalDays(); i++) {
    if (getPlanDay(i).type === 'catchup') return i;
  }
  return null;
}

/** How the projected finish compares with the user's own deadline (if they set one). */
export function deadlineVerdict(drift = computeDrift()) {
  const dl = plan().meta.deadline;
  if (!dl?.date) return null;
  const end = projection(totalDays(), drift).projected;
  const buffer = diffDays(end, dl.date);
  if (buffer >= 7) return { level: 'good', end, dl, buffer, text: `You'd finish ${buffer} days before ${dl.label}. Good buffer.` };
  if (buffer >= 0) return { level: 'warn', end, dl, buffer, text: `You'd finish only ${buffer} day${buffer === 1 ? '' : 's'} before ${dl.label}. Almost no room left for more missed days.` };
  return { level: 'bad', end, dl, buffer, text: `You'd finish ${-buffer} day${buffer === -1 ? '' : 's'} after ${dl.label}. Catch up on the next catch-up day, or cut scope.` };
}

export function isPast(iso) { return parseISO(iso) < parseISO(todayISO()); }
