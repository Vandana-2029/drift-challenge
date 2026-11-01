// FOCUS: a simple focus timer (25/5 or 50/10) that logs focused minutes per day.
// The timer keeps running if you switch pages, because its state lives in this module.
import { load, touch } from '../store.js';
import { todayISO, addDays, fmtDate, toast, esc } from '../utils.js';
import { tracks } from '../plan.js';

const PRESETS = [
  { id: '25', work: 25, rest: 5, label: '25 / 5' },
  { id: '50', work: 50, rest: 10, label: '50 / 10' },
  { id: '90', work: 90, rest: 15, label: '90 / 15' },
];
const blocks = () => [...tracks().map(t => t.name), 'Other'];

const T = { preset: PRESETS[0], block: '', phase: 'work', running: false, endAt: 0, left: 25 * 60, tick: null, startedAt: 0 };

function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
  } catch { /* no audio */ }
}

function logMinutes(min) {
  const s = load();
  const d = todayISO();
  s.focus[d] = (s.focus[d] || 0) + min;
  touch();
}

function finishPhase() {
  T.running = false;
  clearInterval(T.tick);
  beep();
  if (T.phase === 'work') {
    logMinutes(T.preset.work);
    toast(`${T.preset.work} focused minutes logged. Take a break.`);
    T.phase = 'rest'; T.left = T.preset.rest * 60;
  } else {
    toast('Break over. Ready for the next round?');
    T.phase = 'work'; T.left = T.preset.work * 60;
  }
  document.title = 'Drift: 30/60/90-Day Challenge';
}

function startTick(update) {
  clearInterval(T.tick);
  T.tick = setInterval(() => {
    T.left = Math.max(0, Math.round((T.endAt - Date.now()) / 1000));
    document.title = `${fmt(T.left)} · ${T.phase === 'work' ? T.block : 'Break'}`;
    if (T.left <= 0) finishPhase();
    update();
  }, 500);
}

export function render(root, ctx) {
  if (!T.block) T.block = blocks()[0];
  const s = load();
  const today = todayISO();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const maxMin = Math.max(60, ...week.map(d => s.focus[d] || 0));

  const draw = () => {
    root.innerHTML = `
    <div class="stack">
      <div class="page-head"><h1>Focus</h1><p>One block at a time. Put your phone in another room before you press start.</p></div>
      <div class="card" style="text-align:center">
        <div class="row" style="justify-content:center;margin-bottom:10px">
          <div class="seg" role="group" aria-label="Timer length">${PRESETS.map(p => `<button data-preset="${p.id}" class="${p.id === T.preset.id ? 'on' : ''}" ${T.running ? 'disabled' : ''}>${p.label}</button>`).join('')}</div>
        </div>
        <div class="row" style="justify-content:center">
          <div class="seg" role="group" aria-label="Block">${blocks().map(b => `<button data-block="${esc(b)}" class="${b === T.block ? 'on' : ''}">${esc(b)}</button>`).join('')}</div>
        </div>
        <p class="muted small" style="margin-top:14px">${T.phase === 'work' ? `Focus: ${T.block}` : 'Break: stand up, drink water, look away from the screen'}</p>
        <div class="timer" id="clock">${fmt(T.left)}</div>
        <div class="row" style="justify-content:center">
          <button class="btn primary" id="start">${T.running ? 'Pause' : T.left < (T.phase === 'work' ? T.preset.work : T.preset.rest) * 60 ? 'Resume' : 'Start'}</button>
          <button class="btn" id="reset">Reset</button>
          ${T.phase === 'rest' ? '<button class="btn" id="skip">Skip break</button>' : ''}
        </div>
        <p class="tiny" style="margin-top:12px">Stopped early? Partial minutes are logged when you reset (if 5+ minutes).</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Focused minutes</h2><span class="small">Today: <strong>${s.focus[today] || 0} min</strong></span></div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;align-items:end;height:140px">
          ${week.map(d => { const v = s.focus[d] || 0; return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end">
            <span class="tiny">${v || ''}</span>
            <div style="width:100%;max-width:38px;height:${Math.round((v / maxMin) * 100)}%;min-height:3px;background:${d === today ? 'var(--accent)' : 'var(--heat-3)'};border-radius:6px"></div>
            <span class="tiny">${fmtDate(d).split(' ')[0]}</span></div>`; }).join('')}
        </div>
      </div>
      <div class="card">
        <h2>When you feel distracted</h2>
        <ul class="small">
          <li>Write the distracting thought on paper and come back to it in the break.</li>
          <li>Too hard? Shrink the task: “just do the first 10 minutes”.</li>
          <li>Lost the whole day? Do the Minimum Day. Never zero.</li>
        </ul>
      </div>
    </div>`;

    root.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      T.preset = PRESETS.find(p => p.id === b.dataset.preset); T.phase = 'work'; T.left = T.preset.work * 60; draw();
    }));
    root.querySelectorAll('[data-block]').forEach(b => b.addEventListener('click', () => { T.block = b.dataset.block; draw(); }));
    root.querySelector('#start').addEventListener('click', () => {
      if (T.running) { T.running = false; clearInterval(T.tick); draw(); return; }
      if (T.phase === 'work' && T.left === T.preset.work * 60) T.startedAt = Date.now();
      T.running = true; T.endAt = Date.now() + T.left * 1000;
      startTick(update); draw();
    });
    root.querySelector('#reset').addEventListener('click', () => {
      if (T.phase === 'work') {
        const used = Math.floor((T.preset.work * 60 - T.left) / 60);
        if (used >= 5) { logMinutes(used); toast(`${used} minutes logged.`); }
      }
      T.running = false; clearInterval(T.tick); T.phase = 'work'; T.left = T.preset.work * 60; document.title = 'Drift: 30/60/90-Day Challenge';
      ctx.rerender();
    });
    root.querySelector('#skip')?.addEventListener('click', () => { T.running = false; clearInterval(T.tick); T.phase = 'work'; T.left = T.preset.work * 60; draw(); });
  };

  // Only update the clock text while this page is open; re-draw fully when a phase ends.
  let lastPhase = T.phase;
  const update = () => {
    const clock = root.querySelector('#clock');
    if (!clock || !document.body.contains(clock)) return;
    if (T.phase !== lastPhase || !T.running) { lastPhase = T.phase; ctx.rerender(); return; }
    clock.textContent = fmt(T.left);
  };
  draw();
  if (T.running) startTick(update);
}
