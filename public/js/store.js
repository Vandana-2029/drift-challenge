// Progress for the logged-in user. Kept in memory, cached in localStorage, and synced to the server
// (debounced) so it survives refreshes, other browsers and other devices.
import { todayISO, toast } from './utils.js';
import { api } from './api.js';

export const DONE_STATUSES = new Set(['done', 'done_with_help']);
let KEY = 'drift-progress';

function defaults() {
  return {
    version: 1,
    startDate: null,
    tasks: {}, days: {}, milestones: {}, customGoals: [],
    apps: [], mocks: [], lcExtra: 0, focus: {},
    why: '', shifts: [], lastActive: null, theme: null, lastBackup: null,
  };
}

let memory = defaults();
let syncTimer = null;
let syncState = 'saved'; // 'saved' | 'saving' | 'offline'
const listeners = new Set();

export function onSyncChange(fn) { listeners.add(fn); }
function setSync(s) { syncState = s; listeners.forEach(fn => fn(s)); }
export function syncStatus() { return syncState; }

/** Load progress for a user: server copy wins; falls back to the local cache when offline. */
export async function init(userId) {
  KEY = `drift-progress-${userId}`;
  let local = null;
  try { local = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  try {
    const { data } = await api('GET', '/progress');
    memory = { ...defaults(), ...(data || local || {}) };
    if (!data && local) queueSync(); // first time on this server: upload what we had
    setSync('saved');
  } catch {
    memory = { ...defaults(), ...(local || {}) };
    setSync('offline');
  }
  return memory;
}

export function load() { return memory; }

function cacheLocally() {
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* storage blocked: server copy still works */ }
}

async function pushNow() {
  syncTimer = null;
  setSync('saving');
  try {
    await api('PUT', '/progress', { data: memory });
    setSync('saved');
  } catch (err) {
    setSync('offline');
    if (err.status === 401) { toast('Your session expired. Please log in again.'); location.hash = '#/login'; return; }
    syncTimer = setTimeout(pushNow, 15000); // retry later
  }
}

function queueSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushNow, 800);
}

/** Save now: local cache immediately, server shortly after. */
export function save() { cacheLocally(); queueSync(); }

/** Flush pending changes (e.g. before logging out or closing the tab). */
export async function flush() {
  if (syncTimer) { clearTimeout(syncTimer); await pushNow(); }
}

export function touch() { memory.lastActive = todayISO(); save(); }

export function getTask(id) { return memory.tasks[id] || { status: 'not_started' }; }

export function setTaskStatus(id, status) {
  if (status === 'not_started') delete memory.tasks[id];
  else memory.tasks[id] = { status, at: todayISO() };
  touch();
}

export function isDone(id) { return DONE_STATUSES.has(getTask(id).status); }

export function getDay(n) {
  if (!memory.days[n]) memory.days[n] = { dayType: 'full', minimum: {}, notes: '', wins: ['', '', ''], energy: '' };
  return memory.days[n];
}

export function updateDay(n, patch) { Object.assign(getDay(n), patch); touch(); }

export function replaceAll(data) { memory = { ...defaults(), ...data }; save(); }

export function resetProgress(startDate) { memory = { ...defaults(), startDate }; save(); }

export function exportJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), app: 'drift-challenge', data: memory }, null, 2);
}

/** Accepts this app's backups and backups from the original 90-day tracker. */
export function parseBackup(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  if (typeof data !== 'object' || !data.tasks) throw new Error('This file is not a progress backup.');
  return data;
}

// save pending changes when the tab is hidden or closed
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
