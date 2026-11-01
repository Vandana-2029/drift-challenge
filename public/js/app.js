// Entry point: checks the session, loads the user's plan + progress, then routes by URL hash.
import { api } from './api.js';
import * as store from './store.js';
import { fetchPlan, hasPlan, dayNumber, totalDays } from './plan.js';
import { setUser, user } from './session.js';
import { diffDays, todayISO, esc } from './utils.js';
import { renderLanding, renderAuth } from './views/auth.js';
import * as onboarding from './views/onboarding.js';
import * as today from './views/today.js';
import * as dashboard from './views/dashboard.js';
import { driftStrip } from './views/dashboard.js';
import * as goals from './views/goals.js';
import * as planView from './views/plan.js';
import * as jobs from './views/jobs.js';
import * as practice from './views/practice.js';
import * as focus from './views/focus.js';
import * as settings from './views/settings.js';
import { maybeWelcome } from './replan.js';

const routes = { today, dashboard, goals, plan: planView, jobs, practice, focus, settings, new: onboarding };
const app = document.getElementById('app');
const tabs = document.getElementById('tabs');
const pill = document.getElementById('day-pill');
const syncDot = document.getElementById('sync');
let storageMode = 'mongodb';

/* ---------- theme (stored per browser) ---------- */
function applyTheme() {
  let t = null;
  try { t = localStorage.getItem('drift-theme'); } catch { /* ignore */ }
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  try { localStorage.setItem('drift-theme', dark ? 'light' : 'dark'); } catch { /* ignore */ }
  applyTheme();
});
applyTheme();

/* ---------- header ---------- */
function updateHeader() {
  const loggedIn = Boolean(user());
  tabs.hidden = !loggedIn || !hasPlan();
  syncDot.hidden = !loggedIn;
  if (!loggedIn || !hasPlan()) { pill.hidden = true; return; }
  pill.hidden = false;
  const n = dayNumber();
  if (n < 1) pill.textContent = `Starts in ${1 - n}d`;
  else if (n > totalDays()) pill.textContent = 'Finished';
  else pill.textContent = `Day ${n} / ${totalDays()}`;
}
store.onSyncChange((s) => {
  syncDot.className = `sync-dot ${s === 'saved' ? '' : s}`;
  syncDot.title = s === 'saved' ? 'All changes saved' : s === 'saving' ? 'Saving…' : 'Offline: changes will sync when you reconnect';
});

function banners() {
  let html = driftStrip();
  if (storageMode === 'memory') html += `<div class="banner bad small" style="margin-top:10px">Test mode: this server has no database connected, so data is lost when it restarts. <a href="#/settings">Download a backup</a>.</div>`;
  const s = store.load();
  const age = s.lastBackup ? diffDays(s.lastBackup, todayISO()) : null;
  if (dayNumber() >= 14 && (age === null || age >= 30)) html += `<div class="banner info small" style="margin-top:10px">Your progress is saved to your account. For extra safety, <a href="#/settings">download a backup</a> once a month.</div>`;
  return html;
}

/* ---------- routing ---------- */
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || '', params: parts.slice(1) };
}

function render() {
  const { name, params } = parseHash();
  updateHeader();
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.route === name || (!name && a.dataset.route === 'today')));

  if (!user()) {
    if (name === 'login' || name === 'signup') return renderAuth(app, name, startSession);
    return renderLanding(app);
  }
  if (!hasPlan() && name !== 'new') { location.replace('#/new'); return; }
  const view = routes[name || 'today'] || (name === 'login' || name === 'signup' ? today : null);
  if (!view) { app.innerHTML = '<div class="card"><h2>Page not found</h2><p><a href="#/today">Go to Today</a></p></div>'; return; }
  view.render(app, {
    params,
    storage: storageMode,
    rerender: render,
    afterRender: (root) => {
      const strip = root.querySelector('#drift-strip');
      if (strip) strip.innerHTML = banners();
    },
  });
}

async function startSession(u, meta = {}) {
  setUser(u);
  app.innerHTML = '<div class="card" style="text-align:center;padding:30px"><div class="spinner"></div><p class="muted small" style="margin-top:10px">Loading your plan…</p></div>';
  if (meta.storage) storageMode = meta.storage;
  await store.init(u.id);
  try { await fetchPlan(); } catch { /* no plan yet */ }
  if (!location.hash || ['#/login', '#/signup', '#/', '#'].includes(location.hash)) location.hash = hasPlan() ? '#/today' : '#/new';
  render();
  if (hasPlan()) maybeWelcome(render);
}

async function boot() {
  window.addEventListener('hashchange', () => { render(); app.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  try {
    const me = await api('GET', '/me');
    await startSession(me.user, { storage: me.storage });
  } catch (err) {
    if (err.status === 401) { setUser(null); render(); return; }
    app.innerHTML = `<div class="banner bad"><h2>Can't reach the server</h2><p>${esc(err.message)}</p><a class="btn" href="">Try again</a></div>`;
  }
}

boot();
