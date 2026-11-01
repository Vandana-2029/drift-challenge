// Landing page, log in and sign up.
import { api } from '../api.js';

export function renderLanding(root) {
  root.innerHTML = `
  <div class="stack">
    <section class="hero">
      <h1>Turn your 30, 60 or 90-day goals into a plan you'll actually follow</h1>
      <p>Answer a few questions. AI builds your day-by-day plan around the hours you really have. Then track it, and see exactly how missed days push your goals back.</p>
      <div class="row" style="justify-content:center">
        <a class="btn primary" href="#/signup">Create a free account</a>
        <a class="btn" href="#/login">Log in</a>
      </div>
    </section>
    <div class="steps">
      <div class="card"><h3>1. Tell it your goals</h3><p class="small muted">What you want by Day 30, 60 and 90, the areas you'll work on, your hours, and your rest days.</p></div>
      <div class="card"><h3>2. Get a daily plan</h3><p class="small muted">Phases, milestones and specific tasks for every day, with catch-up and rest days built in.</p></div>
      <div class="card"><h3>3. See your drift</h3><p class="small muted">Tick tasks each day. Fall behind and the dashboard shows how many days your goal has moved, and how to win them back.</p></div>
    </div>
    <div class="card">
      <h2>Built for people who start strong and then drift</h2>
      <ul class="small">
        <li><strong>Minimum Day:</strong> on bad days, 3 tiny actions keep your streak alive.</li>
        <li><strong>Welcome back:</strong> after a break, it helps you restart without guilt instead of starting over.</li>
        <li><strong>Catch-up days:</strong> missed work has a home, so you never have to do double.</li>
        <li><strong>Your data, every device:</strong> progress is saved to your account.</li>
      </ul>
    </div>
  </div>`;
}

function form(kind) {
  const signup = kind === 'signup';
  return `
  <div class="auth-wrap">
    <div class="card">
      <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="muted small">${signup ? 'Free. Takes 20 seconds.' : 'Log in to see your plan and progress.'}</p>
      <form id="auth-form" class="stack" novalidate>
        ${signup ? '<label class="field">Your name<input name="name" autocomplete="name" required maxlength="60"></label>' : ''}
        <label class="field">Email<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
        <label class="field">Password${signup ? ' <span class="tiny">(at least 8 characters)</span>' : ''}<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="${signup ? 8 : 1}"></label>
        <p class="err" id="auth-err" role="alert"></p>
        <button class="btn primary" type="submit" style="width:100%">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="small" style="margin-top:12px;text-align:center">${signup ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/signup">Create an account</a>'}</p>
    </div>
  </div>`;
}

export function renderAuth(root, kind, onDone) {
  root.innerHTML = form(kind);
  const f = root.querySelector('#auth-form');
  const err = root.querySelector('#auth-err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; err.textContent = '';
    try {
      const { user } = await api('POST', `/auth/${kind}`, body);
      await onDone(user);
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
  f.querySelector('input')?.focus();
}

