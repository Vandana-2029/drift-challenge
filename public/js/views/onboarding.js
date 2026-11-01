// NEW PLAN: the questionnaire → AI generation → preview → start.
import { api } from '../api.js';
import { esc, fmtDate, todayISO, toISO, toast } from '../utils.js';
import { load, save, resetProgress } from '../store.js';
import { setPlan, hasPlan } from '../plan.js';
import { resetCaches } from '../drift.js';

const DRAFT = 'drift-answers-draft';
let lastAnswers = null;
let lastResult = null;

const BREAKS = [
  { id: 'every-day', label: 'Every day', help: 'Every 7th day is a catch-up day' },
  { id: 'sun-catchup', label: 'Sunday = catch-up', help: 'No new work on Sundays, only catching up' },
  { id: 'sun-off', label: 'Sunday off', help: 'Rest every Sunday' },
  { id: 'weekend-off', label: 'Weekends off', help: 'Rest Saturday and Sunday' },
];
const LEVELS = [
  { id: 'beginner', label: 'Beginner' }, { id: 'some', label: 'Some experience' },
  { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' },
];

function nextMonday() {
  const d = new Date(); const add = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return toISO(d);
}

function draft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch { return null; }
}

function formHTML(a) {
  const v = (x) => esc(x ?? '');
  const len = Number(a.length || 90);
  return `
  <form id="wiz" class="stack wizard" novalidate>
    <div class="card stack">
      <fieldset>
        <legend>1. What is your challenge about?</legend>
        <input name="title" required maxlength="120" value="${v(a.title)}" placeholder="e.g. Get job-ready as a web developer">
      </fieldset>
      <fieldset>
        <legend>2. How long?</legend>
        <div class="choice-grid">
          ${[30, 60, 90].map(n => `<label class="choice"><input type="radio" name="length" value="${n}" ${len === n ? 'checked' : ''}><span>${n} days</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="form-grid">
        <label class="field">3. Start date<input type="date" name="startDate" required value="${v(a.startDate || todayISO())}"></label>
        <label class="field">Your level
          <select name="level">${LEVELS.map(l => `<option value="${l.id}" ${a.level === l.id ? 'selected' : ''}>${l.label}</option>`).join('')}</select>
        </label>
      </div>
    </div>

    <div class="card stack">
      <fieldset>
        <legend>4. Your goals</legend>
        <label class="field">By Day 30 I want to…<textarea name="d30" rows="2" required maxlength="600" placeholder="e.g. Finish JavaScript and React basics, solve 40 easy problems">${v(a.goals?.d30)}</textarea></label>
        <label class="field" data-len="60">By Day 60…<textarea name="d60" rows="2" maxlength="600" placeholder="e.g. Build and deploy a full-stack project">${v(a.goals?.d60)}</textarea></label>
        <label class="field" data-len="90">By Day 90…<textarea name="d90" rows="2" maxlength="600" placeholder="e.g. Apply to 100 jobs and do 5 mock interviews">${v(a.goals?.d90)}</textarea></label>
      </fieldset>
      <fieldset>
        <legend>5. Areas you'll work on <span class="tiny">(comma separated, up to 6)</span></legend>
        <input name="areas" required value="${v((a.areas || []).join(', '))}" placeholder="e.g. DSA, React, English speaking">
      </fieldset>
    </div>

    <div class="card stack">
      <fieldset>
        <legend>6. How much time can you give?</legend>
        <div class="form-grid">
          <label class="field">Hours on a weekday<input type="number" name="hoursWeekday" min="0.5" max="12" step="0.5" required value="${v(a.hoursWeekday ?? 3)}"></label>
          <label class="field">Hours on a weekend day<input type="number" name="hoursWeekend" min="0" max="12" step="0.5" required value="${v(a.hoursWeekend ?? 2)}"></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>7. Break days</legend>
        <div class="choice-grid">
          ${BREAKS.map(b => `<label class="choice"><input type="radio" name="breakMode" value="${b.id}" ${(a.breakMode || 'every-day') === b.id ? 'checked' : ''}><span>${b.label}<small>${b.help}</small></span></label>`).join('')}
        </div>
      </fieldset>
      <label class="field">8. What does a typical day look like? <span class="tiny">(optional)</span>
        <textarea name="typicalDay" rows="2" maxlength="800" placeholder="e.g. College 9–4, I study best in the evening, I get distracted by my phone">${v(a.typicalDay)}</textarea>
      </label>
    </div>

    <div class="card stack">
      <fieldset>
        <legend>9. Any important deadline? <span class="tiny">(optional)</span></legend>
        <div class="form-grid">
          <label class="field">What<input name="deadlineLabel" maxlength="80" value="${v(a.deadline?.label)}" placeholder="e.g. Placement season"></label>
          <label class="field">When<input type="date" name="deadlineDate" value="${v(a.deadline?.date)}"></label>
        </div>
      </fieldset>
      <label class="field">10. Anything else the plan should know? <span class="tiny">(optional)</span>
        <textarea name="notes" rows="2" maxlength="800" placeholder="e.g. I already know C++. I use Striver's sheet. I want one project for my resume.">${v(a.notes)}</textarea>
      </label>
    </div>

    <p class="err" id="wiz-err" role="alert"></p>
    <div class="row">
      <button class="btn primary" type="submit">Build my plan</button>
      <label class="btn" style="cursor:pointer">I already have a plan file<input type="file" id="imp" accept="application/json,.json" hidden></label>
    </div>
  </form>`;
}

function readForm(f) {
  const fd = new FormData(f);
  const g = (k) => (fd.get(k) || '').toString().trim();
  return {
    title: g('title'), length: Number(g('length') || 90), startDate: g('startDate'), level: g('level'),
    goals: { d30: g('d30'), d60: g('d60'), d90: g('d90') },
    areas: g('areas').split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 6),
    hoursWeekday: Number(g('hoursWeekday')), hoursWeekend: Number(g('hoursWeekend')),
    breakMode: g('breakMode') || 'every-day',
    typicalDay: g('typicalDay'), notes: g('notes'),
    deadline: { date: g('deadlineDate') || null, label: g('deadlineLabel') },
  };
}

function preview(root, result, ctx) {
  const p = result.plan;
  const first = p.days.slice(0, 7);
  const trackName = (id) => p.tracks.find(t => t.id === id)?.name || id;
  const studyDays = p.days.filter(d => d.type !== 'rest').length;
  const minutes = p.days.reduce((s, d) => s + d.tasks.reduce((a, t) => a + t.minutes, 0), 0);
  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>Your plan is ready</h1><p>${esc(p.meta.title)}</p></div>
    ${result.note ? `<div class="banner warn small">${esc(result.note)}</div>` : result.usedAI ? '<div class="banner good small">Made with AI from your answers. Check it, then start, or regenerate for a different version.</div>' : ''}
    ${p.meta.summary ? `<div class="card"><p>${esc(p.meta.summary)}</p></div>` : ''}
    <div class="grid grid-3">
      <div class="stat"><div class="label">Length</div><div class="value">${p.meta.totalDays} days</div><div class="sub">${fmtDate(p.meta.startDate)} → ${fmtDate(p.meta.endDate)}</div></div>
      <div class="stat"><div class="label">Study days</div><div class="value">${studyDays}</div><div class="sub">${p.meta.totalDays - studyDays} rest days</div></div>
      <div class="stat"><div class="label">Planned work</div><div class="value">${Math.round(minutes / 60)} h</div><div class="sub">across ${p.tracks.length} areas</div></div>
    </div>
    <div class="card">
      <h2>Phases and milestones</h2>
      ${p.phases.map((ph, i) => `<div style="margin-top:10px"><h3>${esc(ph.name)} <span class="tiny">Days ${ph.startDay}–${ph.endDay}</span></h3>
        <p class="small muted">${esc(ph.goal)}</p>
        <ul class="small">${(p.milestones[i]?.items || []).map(it => `<li>${esc(it.text)}</li>`).join('')}</ul></div>`).join('')}
    </div>
    <div class="card">
      <h2>Your first week</h2>
      <div class="table-wrap"><table><thead><tr><th>Day</th><th>Tasks</th></tr></thead><tbody>
        ${first.map(d => `<tr><td class="small"><strong>Day ${d.day}</strong><br>${fmtDate(d.date)}</td><td class="small">${d.type === 'rest' ? '<em>Rest day</em>' : d.tasks.map(t => `${esc(t.title)} <span class="tiny">(${esc(trackName(t.track))}, ${t.minutes} min)</span>`).join('<br>')}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <p class="err" id="pv-err" role="alert"></p>
    <div class="row">
      <button class="btn primary" id="start">Start this plan</button>
      <button class="btn" id="regen">Regenerate</button>
      <button class="btn" id="edit">Edit my answers</button>
      ${typeof result.remainingToday === 'number' ? `<span class="tiny">${result.remainingToday} generations left today</span>` : ''}
    </div>
  </div>`;

  root.querySelector('#start').addEventListener('click', async (e) => {
    if (hasPlan() && !confirm('Start this new plan? Your ticked tasks from the old plan will be cleared (your notes about why, applications and test scores are kept).')) return;
    e.target.disabled = true;
    try {
      await api('POST', '/plan', { plan: p });
      const keep = load();
      const extras = { why: keep.why, apps: keep.apps, mocks: keep.mocks, customGoals: keep.customGoals, theme: keep.theme };
      resetProgress(p.meta.startDate);
      Object.assign(load(), extras); save();
      setPlan(p); resetCaches();
      sessionStorage.removeItem(DRAFT);
      toast('Your plan is set. Day 1, here we go.');
      location.hash = '#/today';
    } catch (err) {
      root.querySelector('#pv-err').textContent = err.message; e.target.disabled = false;
    }
  });
  root.querySelector('#regen').addEventListener('click', () => generate(root, lastAnswers, ctx));
  root.querySelector('#edit').addEventListener('click', () => render(root, ctx, { keepDraft: true }));
}

async function generate(root, answers, ctx) {
  lastAnswers = answers;
  root.innerHTML = `<div class="card" style="text-align:center;padding:40px 16px">
    <div class="spinner"></div>
    <h2 style="margin-top:16px">Building your plan…</h2>
    <p class="muted small">This can take up to a minute. (If the server was asleep, the first request takes a little longer.)</p>
  </div>`;
  try {
    lastResult = await api('POST', '/plan/generate', { answers });
    preview(root, lastResult, ctx);
  } catch (err) {
    render(root, ctx, { keepDraft: true, error: err.message });
  }
}

export function render(root, ctx, opts = {}) {
  const a = draft() || lastAnswers || { startDate: nextMonday() };
  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>${hasPlan() ? 'Create a new plan' : 'Let\'s build your plan'}</h1><p>10 quick questions. Be honest about your time: a plan you can keep beats a perfect plan you drop.</p></div>
    ${formHTML(a)}
  </div>`;
  const f = root.querySelector('#wiz');
  const err = root.querySelector('#wiz-err');
  if (opts.error) err.textContent = opts.error;

  const syncLen = () => {
    const len = Number(new FormData(f).get('length') || 90);
    f.querySelectorAll('[data-len]').forEach(el => { el.hidden = Number(el.dataset.len) > len; });
  };
  f.addEventListener('change', syncLen); syncLen();
  f.addEventListener('input', () => { try { sessionStorage.setItem(DRAFT, JSON.stringify(readForm(f))); } catch { /* ignore */ } });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const answers = readForm(f);
    if (answers.title.length < 3) return (err.textContent = 'Give your challenge a short title.');
    if (!answers.startDate) return (err.textContent = 'Pick a start date.');
    if (answers.goals.d30.length < 3) return (err.textContent = 'Write at least your Day 30 goal.');
    if (!answers.areas.length) return (err.textContent = 'Add at least one area you\'ll work on.');
    if (!(answers.hoursWeekday >= 0.5)) return (err.textContent = 'Give at least 30 minutes on weekdays.');
    if (answers.deadline.date && answers.deadline.date < answers.startDate) return (err.textContent = 'The deadline is before the start date.');
    generate(root, answers, ctx);
  });

  root.querySelector('#imp').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const p = JSON.parse(await file.text());
      await api('POST', '/plan', { plan: p });
      setPlan(p); resetCaches();
      if (!load().startDate) { load().startDate = p.meta.startDate; save(); }
      toast('Plan imported.'); location.hash = '#/today';
    } catch (ex) { err.textContent = ex.message || 'Could not read that plan file.'; }
  });
}

