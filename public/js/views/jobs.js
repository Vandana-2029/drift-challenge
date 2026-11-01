// APPLICATIONS: a simple log for job, internship, college or any other applications, with follow-up reminders.
import { load, save, touch } from '../store.js';
import { esc, fmtDate, todayISO, addDays, uid, toast, diffDays } from '../utils.js';
import { stat } from '../components.js';
import { firstName } from '../session.js';

const STATUSES = ['Applied', 'Test scheduled', 'Test done', 'Interview', 'Offer', 'Rejected', 'No response'];
const FINAL = new Set(['Offer', 'Rejected']);
const SOURCES = ['Company website', 'LinkedIn', 'Job board', 'Referral', 'Email', 'Event', 'Other'];

const template = () => `Hi [Name], I'm ${firstName()}. I saw that you work at [Company] as [Role]. I've been working on [what you're building / learning] (link: [link]). I'm applying for the [Job title] role ([job link]). Would you be open to referring me, or sharing any advice? Thank you for your time!`;

export function render(root, ctx) {
  const s = load();
  const today = todayISO();
  const apps = [...s.apps].sort((a, b) => b.date.localeCompare(a.date));
  const due = apps.filter(a => a.followUp && a.followUp <= today && !FINAL.has(a.status));
  const weekAgo = addDays(today, -6);
  const count = st => apps.filter(a => a.status === st).length;

  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>Applications</h1><p>Log every application. Follow up on time. One of them is enough.</p></div>

    <div class="grid grid-4">
      ${stat('Applications', apps.length, `${apps.filter(a => a.date >= weekAgo).length} in the last 7 days`)}
      ${stat('Referral requests', apps.filter(a => a.source === 'Referral').length, 'warm intros work best')}
      ${stat('Tests + interviews', count('Test scheduled') + count('Test done') + count('Interview'), `${count('Interview')} interviews`)}
      ${stat('Offers', count('Offer'), count('Offer') ? 'Well done!' : 'it only takes one')}
    </div>

    ${due.length ? `<div class="banner warn"><h3>${due.length} follow-up${due.length > 1 ? 's' : ''} due</h3><p class="small">${due.map(a => esc(a.company)).join(', ')}. Send a short, polite message or check the portal.</p></div>` : ''}

    <div class="card">
      <h2>Log an application</h2>
      <form id="app-form" class="form-grid">
        <label class="field">Company / organisation<input name="company" required maxlength="80"></label>
        <label class="field">Role<input name="role" maxlength="80"></label>
        <label class="field">Source<select name="source">${SOURCES.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field">Date<input type="date" name="date" value="${today}"></label>
        <label class="field">Follow up on<input type="date" name="followUp" value="${addDays(today, 7)}"></label>
        <label class="field">Link<input name="link" type="url" placeholder="https://"></label>
        <button class="btn primary" type="submit">Add</button>
      </form>
    </div>

    <div class="card">
      <div class="card-head"><h2>My applications</h2><span class="tiny">Rows turn yellow when a follow-up is due</span></div>
      ${apps.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Company</th><th>Role</th><th>Source</th><th>Applied</th><th>Status</th><th>Follow up</th><th></th></tr></thead>
        <tbody>${apps.map(a => `<tr class="${due.includes(a) ? 'due' : ''}">
          <td><strong>${a.link && /^https?:\/\//.test(a.link) ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.company)}</a>` : esc(a.company)}</strong></td>
          <td>${esc(a.role || '')}</td>
          <td class="small">${esc(a.source)}</td>
          <td class="small">${fmtDate(a.date, { weekday: false })}</td>
          <td><select data-status="${a.id}" aria-label="Status">${STATUSES.map(x => `<option ${x === a.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
          <td class="small">${a.followUp && !FINAL.has(a.status) ? `${fmtDate(a.followUp, { weekday: false })}${a.followUp <= today ? ' · due' : ` · in ${diffDays(today, a.followUp)}d`}
            <button class="btn sm" data-snooze="${a.id}" title="Followed up; remind me again in 7 days">done +7d</button>` : '—'}</td>
          <td><button class="btn sm danger" data-del="${a.id}" aria-label="Delete">✕</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No applications yet. The first one is the hardest. Log it here.</p>'}
    </div>

    <div class="card">
      <div class="card-head"><h2>Referral / outreach message</h2><button class="btn sm" id="copy-tpl">Copy</button></div>
      <p class="small" style="white-space:pre-wrap">${esc(template())}</p>
      <p class="tiny">Fill in the brackets. Seniors from your college or past colleagues are the most likely to reply.</p>
    </div>
  </div>`;

  root.querySelector('#app-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    s.apps.push({ id: uid(), company: f.company.trim(), role: f.role.trim(), source: f.source, date: f.date || today, followUp: f.followUp, link: f.link.trim(), status: 'Applied' });
    touch(); toast('Application logged. That counts.'); ctx.rerender();
  });
  root.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', () => {
    s.apps.find(x => x.id === sel.dataset.status).status = sel.value; touch(); ctx.rerender();
  }));
  root.querySelectorAll('[data-snooze]').forEach(b => b.addEventListener('click', () => {
    s.apps.find(x => x.id === b.dataset.snooze).followUp = addDays(today, 7); touch(); ctx.rerender();
  }));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Delete this application?')) return;
    s.apps = s.apps.filter(x => x.id !== b.dataset.del); save(); ctx.rerender();
  }));
  root.querySelector('#copy-tpl').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(template()); toast('Copied'); } catch { toast('Select the text and copy it manually'); }
  });
}
