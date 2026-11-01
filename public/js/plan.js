// The logged-in user's plan (from the server) plus helpers that combine it with their start date.
import { load } from './store.js';
import { addDays, diffDays, todayISO } from './utils.js';
import { api } from './api.js';

let PLAN = null;

export async function fetchPlan() {
  const { plan } = await api('GET', '/plan');
  setPlan(plan);
  return plan;
}

export function setPlan(plan) {
  PLAN = plan;
  if (plan) {
    const s = load();
    if (!s.startDate) s.startDate = plan.meta.startDate;
  }
}

export function plan() { return PLAN; }
export function hasPlan() { return Boolean(PLAN); }
export function totalDays() { return PLAN?.meta.totalDays || 90; }
export function startDate() { return load().startDate || PLAN.meta.startDate; }

/** Calendar date of plan day n (1-based). */
export function dateOf(n) { return addDays(startDate(), n - 1); }

/** Plan day number for a date. Can be < 1 (not started) or > totalDays (finished). */
export function dayNumber(iso = todayISO()) { return diffDays(startDate(), iso) + 1; }

/** Today's plan day, clamped for display. */
export function currentDay() { return Math.min(totalDays(), Math.max(1, dayNumber())); }

export function getPlanDay(n) { return PLAN.days[n - 1]; }

export function phaseOf(n) { return PLAN.phases.find(p => n >= p.startDay && n <= p.endDay) || PLAN.phases[PLAN.phases.length - 1]; }

export function allTasks() {
  return PLAN.days.flatMap(d => d.tasks.map(t => ({ ...t, day: d.day, dayType: d.type })));
}

/** Catch-up days are buffers: their own tasks don't count as required work. */
export function isBufferTask(t) { return t.dayType === 'catchup'; }

export function tracks() { return PLAN?.tracks || []; }
export function track(id) { return tracks().find(t => t.id === id); }
export function trackOrder() { return tracks().map(t => t.id); }
