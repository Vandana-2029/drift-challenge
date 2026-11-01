// SETTINGS: account, your reason, re-plan, start date, plan files, progress backup, delete account.
import { load, save, exportJSON, parseBackup, replaceAll, flush, syncStatus } from '../store.js';
import { plan, setPlan, dayNumber, startDate, dateOf, totalDays } from '../plan.js';
import { firstUnfinishedDay, replanTarget, shiftFor, replanTo, undoLastShift, shiftSummary } from '../replan.js';
import { resetCaches } from '../drift.js';
import { esc, fmtDate, todayISO, toast, debounce, plural, diffDays } from '../utils.js';
import { user } from '../session.js';
import { api } from '../api.js';

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function render(root, ctx) {
  const s = load();
  const u = user();
  const n = dayNumber();
  const started = n >= 1;
  const target = replanTarget();
  const first = firstUnfinishedDay();
  const shift = shiftFor(target);
  const backupAge = s.lastBackup ? diffDays(s.lastBackup, todayISO()) : null;
  const memoryMode = ctx.storage === 'memory';

  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>Settings</h1><p>Your account, your plan, your data.</p></div>

    ${memoryMode ? `<div class="banner bad"><h3>Test mode: this server has no database yet</h3><p class="small">Accounts and progress are kept in memory and disappear when the server restarts. The owner needs to add <kbd>MONGODB_URI</kbd> in Render. Download a backup to be safe.</p></div>` : ''}

    <div class="card">
      <h2>Account</h2>
      <p class="small">Logged in as <strong>${esc(u?.name || '')}</strong> (${esc(u?.email || '')}). Progress is saved to your account automatically <span class="tiny">(${esc(syncStatus())})</span>, so it's the same on every device you log in from.</p>
      <button class="btn" id="logout">Log out</button>
    </div>

    <div class="card">
      <h2>Why I'm doing this</h2>
      <p class="muted small">Write it for the version of you who wants to quit halfway. It shows on the Drift page.</p>
      <textarea id="why" rows="4" maxlength="1000" placeholder="e.g. I want to prove to myself that I can finish something.">${esc(s.why || '')}</textarea>
    </div>

    <div class="card">
      <h2>Restart after a break (re-plan)</h2>
      ${shift <= 0 ? `<p class="small">You're on track, so there's nothing to re-plan right now. If you fall behind after a break, this moves your dates by exactly your drift.</p>`
        : `<p class="small">You're ${plural(shift, 'day')} behind (oldest unfinished task: Day ${first}). Re-planning makes today <strong>Day ${target}</strong> and moves every later date by ${plural(shift, 'day')}. Progress is kept and the shift is recorded.</p>`}
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="replan" ${!started || shift <= 0 ? 'disabled' : ''}>Re-plan: today becomes Day ${target}</button>
        <button class="btn" id="undo" ${s.shifts.length ? '' : 'disabled'}>Undo last re-plan</button>
      </div>
      ${s.shifts.length ? `<p class="small muted" style="margin-top:10px">${shiftSummary()}</p>` : ''}
    </div>

    <div class="card">
      <h2>Dates</h2>
      <p class="small">Day 1 is <strong>${fmtDate(startDate(), { year: true })}</strong>, Day ${totalDays()} is <strong>${fmtDate(dateOf(totalDays()), { year: true })}</strong>.</p>
      ${!started ? `<div class="row" style="margin-top:8px"><input type="date" id="start" value="${startDate()}" style="max-width:200px"><button class="btn" id="set-start">Change start date</button></div>`
        : '<p class="tiny">Your challenge has started. To change dates now, use re-plan above so the change stays visible.</p>'}
    </div>

    <div class="card">
      <h2>Your plan</h2>
      <p class="small"><strong>${esc(plan().meta.title)}</strong> · ${totalDays()} days · ${plan().meta.generator?.startsWith('groq') ? 'made with AI' : plan().meta.generator === 'template' ? 'made with the built-in template' : 'imported'}</p>
      <div class="row" style="margin-top:8px">
        <a class="btn primary" href="#/new">Create a new plan</a>
        <button class="btn" id="dl-plan">Download plan file</button>
        <label class="btn" style="cursor:pointer">Import a plan file<input type="file" id="imp-plan" accept="application/json,.json" hidden></label>
      </div>
      <p class="tiny" style="margin-top:6px">Importing replaces your current plan (your ticked tasks stay, matched by task ID). Plan files from the original 90-day tracker work too.</p>
    </div>

    <div class="card">
      <h2>Backup</h2>
      <p class="small">Your progress is already saved to your account. A backup file is extra safety, and lets you move progress between apps.</p>
      <p class="tiny">${backupAge === null ? 'No backup downloaded yet.' : `Last backup: ${plural(backupAge, 'day')} ago.`}</p>
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="export">Download backup</button>
        <label class="btn" style="cursor:pointer">Restore from file<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
    </div>

    <div class="card">
      <h2>Delete account</h2>
      <p class="small">Permanently deletes your account, plan and progress from this server. Download a backup first if you want to keep anything.</p>
      <button class="btn danger" id="delete">Delete my account</button>
    </div>
  </div>`;

  root.querySelector('#logout').addEventListener('click', async () => {
    await flush();
    await api('POST', '/auth/logout').catch(() => {});
    location.hash = '#/login'; location.reload();
  });
  root.querySelector('#why').addEventListener('input', debounce(e => { s.why = e.target.value; save(); toast('Saved'); }, 600));
  root.querySelector('#replan').addEventListener('click', () => {
    if (!confirm(`Make today Day ${target}? Every later date moves by ${shift} days.`)) return;
    const d = replanTo(target, 'Re-planned from Settings');
    toast(`Re-planned. Dates moved ${d} days. Today is Day ${target}.`); ctx.rerender();
  });
  root.querySelector('#undo').addEventListener('click', () => {
    const last = undoLastShift(); if (last) { toast(`Undid the ${last.days}-day shift.`); ctx.rerender(); }
  });
  root.querySelector('#set-start')?.addEventListener('click', () => {
    const v = root.querySelector('#start').value;
    if (!v) return;
    s.startDate = v; save(); toast('Start date changed.'); ctx.rerender();
  });
  root.querySelector('#dl-plan').addEventListener('click', () => download(`plan-${todayISO()}.json`, JSON.stringify(plan(), null, 2)));
  root.querySelector('#imp-plan').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const p = JSON.parse(await file.text());
      await api('POST', '/plan', { plan: p });
      setPlan(p); resetCaches();
      if (!s.startDate || confirm(`Use this plan's start date (${p.meta.startDate})?`)) { s.startDate = p.meta.startDate; save(); }
      toast('Plan imported.'); location.hash = '#/today';
    } catch (err) { toast(err.message || 'Could not read that plan file.'); }
  });
  root.querySelector('#export').addEventListener('click', () => {
    s.lastBackup = todayISO(); save();
    download(`drift-backup-${todayISO()}.json`, exportJSON());
    ctx.rerender();
  });
  root.querySelector('#import').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = parseBackup(await file.text());
      if (!confirm('Replace your current progress with this backup?')) return;
      replaceAll(data); await flush();
      toast('Backup restored.'); ctx.rerender();
    } catch (err) { toast(err.message || 'Could not read that file.'); }
  });
  root.querySelector('#delete').addEventListener('click', async () => {
    const typed = prompt('Type DELETE to permanently delete your account and all your data.');
    if (typed !== 'DELETE') return;
    try { await api('DELETE', '/account'); location.hash = '#/'; location.reload(); } catch (err) { toast(err.message); }
  });
}
