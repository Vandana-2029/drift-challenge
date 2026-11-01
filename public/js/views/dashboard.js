// DRIFT: shows how unfinished daily work pushes the big goals back, with the consequences spelled out.
import { BEHIND, computeDrift, projection, streaks, driftHistory, nextCatchup, deadlineVerdict, shiftedDays, dailyCapacity } from '../drift.js';
import { plan, dayNumber, allTasks, getPlanDay, totalDays } from '../plan.js';
import { load, isDone } from '../store.js';
import { esc, fmtDate, plural } from '../utils.js';
import { trackChip } from '../components.js';
import { track } from '../plan.js';
import { stat } from '../components.js';

const fmtDays = (d) => {
  const a = Math.abs(d);
  return a < BEHIND ? '0 days' : `${a.toFixed(1)} day${a.toFixed(1) === '1.0' ? '' : 's'}`;
};

/** Small banner reused on the Today page. */
export function driftStrip(drift = computeDrift()) {
  if (drift.dayNumber < 2) return '';
  const end = projection(totalDays(), drift);
  if (drift.days > BEHIND) {
    const cls = drift.days >= 5 ? 'bad' : 'warn';
    return `<a href="#/dashboard" style="text-decoration:none;color:inherit"><div class="banner ${cls} row between">
      <div><strong>Your big goal is drifting: ${fmtDays(drift.days)} behind.</strong>
      <div class="small">Day ${totalDays()} moves from ${fmtDate(end.original)} to ${fmtDate(end.projected)}. Tap to see what that costs you.</div></div>
      <span class="big-number ${cls}-ink">+${drift.shift}d</span></div></a>`;
  }
  if (drift.days < -BEHIND) {
    return `<div class="banner good"><strong>You're ${fmtDays(drift.days)} ahead of plan.</strong> <span class="small">Keep this up and you'll finish early.</span></div>`;
  }
  if (end.lateBy > 0) {
    return `<div class="banner warn"><strong>Back on track.</strong> <span class="small">Your re-plan moved Day ${totalDays()} by ${end.lateBy} days, to ${fmtDate(end.projected)}. Protect it.</span></div>`;
  }
  return `<div class="banner good"><strong>On track.</strong> <span class="small">Day ${totalDays()} is still ${fmtDate(end.projected)}.</span></div>`;
}

function chart(history) {
  if (history.length < 2) return '<p class="empty">The chart appears after your second day.</p>';
  const W = 680, H = 220, L = 40, R = 12, T = 14, B = 28;
  const vals = history.map(h => h.drift);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const x = i => L + (i / (history.length - 1)) * (W - L - R);
  const y = v => T + ((max - v) / (max - min)) * (H - T - B);
  const pts = history.map((h, i) => `${x(i).toFixed(1)},${y(h.drift).toFixed(1)}`).join(' ');
  const ticks = [min, 0, max].filter((v, i, a) => a.indexOf(v) === i);
  const area = `M${x(0)},${y(0)} L${pts.split(' ').join(' L')} L${x(history.length - 1)},${y(0)} Z`;
  const lastV = vals[vals.length - 1];
  const color = lastV > BEHIND ? 'var(--bad)' : 'var(--good)';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Drift in days over time" style="width:100%;height:auto">
    ${ticks.map(v => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${v.toFixed(0)}d</text>`).join('')}
    <path d="${area}" fill="${color}" fill-opacity="0.12"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>
    <circle cx="${x(history.length - 1)}" cy="${y(lastV)}" r="4" fill="${color}"/>
    <text x="${L}" y="${H - 8}">Day 1</text>
    <text x="${W - R}" y="${H - 8}" text-anchor="end">Day ${history[history.length - 1].day}</text>
  </svg>`;
}

export function render(root) {
  const s = load();
  const drift = computeDrift();
  const n = dayNumber();
  const st = streaks();
  const cap = dailyCapacity();
  const shifted = shiftedDays();
  const verdict = deadlineVerdict(drift);
  const milestones = plan().milestones.map(x => ({ m: x.day, ...projection(x.day, drift), title: x.title }));
  if (!milestones.length || milestones[milestones.length - 1].m !== totalDays()) milestones.push({ m: totalDays(), ...projection(totalDays(), drift), title: `Day ${totalDays()}: finish` });
  const doneTasks = allTasks().filter(t => isDone(t.id));
  const lcDone = doneTasks.filter(t => t.leetcode).length + (s.lcExtra || 0);
  const showLc = lcDone > 0 || allTasks().some(t => t.leetcode);
  const hours = Math.round(doneTasks.reduce((a, t) => a + t.minutes, 0) / 60);
  const nc = nextCatchup();
  const tracks = Object.entries(drift.byTrack).sort((a, b) => b[1] - a[1]);

  const status = n < 2
    ? `<div class="banner info"><h2>Drift starts counting after Day 1</h2><p>Every evening, unfinished tasks from that day turn into "drift": the number of days your last day moves back. Finish tasks and the drift goes down again.</p></div>`
    : drift.days > BEHIND
      ? `<div class="banner ${drift.days >= 5 ? 'bad' : 'warn'}">
          <div class="row between" style="flex-wrap:nowrap"><div style="flex:1">
            <h2>Your big goal has drifted ${fmtDays(drift.days)}</h2>
            <p>You have ${plural(Math.round(drift.backlog / 60), 'hour')} of unfinished work from past days. At your planned pace, your finish line moves from <strong>${fmtDate(milestones[milestones.length - 1].original)}</strong> to <strong>${fmtDate(milestones[milestones.length - 1].projected)}</strong>.</p>
          </div><div class="big-number ${drift.days >= 5 ? 'bad' : 'warn'}-ink">+${drift.shift}d</div></div>
        </div>`
      : milestones[milestones.length - 1].lateBy > 0
        ? `<div class="banner warn"><h2>Back on track, but the finish line moved</h2><p>Re-planning after breaks moved Day ${totalDays()} by <strong>${plural(milestones[milestones.length - 1].lateBy, 'day')}</strong>: from ${fmtDate(milestones[milestones.length - 1].original)} to ${fmtDate(milestones[milestones.length - 1].projected)}. No more drift from here.</p></div>`
        : `<div class="banner good"><h2>${drift.days < -BEHIND ? `You're ${fmtDays(drift.days)} ahead` : 'You are on track'}</h2><p>Day ${totalDays()} lands on ${fmtDate(milestones[milestones.length - 1].projected)}. Keep showing up.</p></div>`;

  root.innerHTML = `
  <div class="stack">
    <div class="page-head"><h1>Drift</h1><p>What happens to your big goals when daily goals slip.</p></div>
    ${status}

    <div class="grid grid-4">
      ${stat('Current streak', st.current, `${plural(st.current, 'day')} in a row · best ${st.longest}`)}
      ${stat('Days showed up', st.showed, `${st.missed} missed so far`)}
      ${showLc ? stat('LeetCode solved', lcDone, 'from the plan + extras') : stat('Tasks finished', doneTasks.length, `of ${allTasks().filter(t => t.dayType !== 'catchup').length} in your plan`)}
      ${stat('Hours of work done', hours, `${doneTasks.length} tasks finished`)}
    </div>

    <div class="card">
      <div class="card-head"><h2>Consequences</h2><span class="tiny">Projected at your planned pace from today</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Big goal</th><th>Original date</th><th>Now</th><th>Change</th></tr></thead>
        <tbody>
        ${milestones.map(x => `<tr>
          <td><strong>${esc(x.title)}</strong></td>
          <td>${fmtDate(x.original)}</td>
          <td>${fmtDate(x.projected)}</td>
          <td class="${x.lateBy > 0 ? (x.lateBy >= 5 ? 'bad-ink' : 'warn-ink') : 'good-ink'}">${x.lateBy > 0 ? `+${plural(x.lateBy, 'day')} late` : x.lateBy < 0 ? `${-x.lateBy} early` : 'on time'}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>
      ${shifted ? `<p class="small muted" style="margin-top:8px">Includes ${plural(shifted, 'day')} from re-planning after a break.</p>` : ''}
      ${verdict ? `<div class="banner ${verdict.level}" style="margin-top:12px">
        <h3>Deadline check: ${esc(verdict.dl.label)} (${fmtDate(verdict.dl.date)})</h3>
        <p>Your finish is now projected for <strong>${fmtDate(verdict.end)}</strong>. ${esc(verdict.text)}</p>
      </div>` : `<p class="tiny" style="margin-top:10px">Tip: add a deadline (an exam, interview season or launch date) when you create a plan, and this page will warn you if missed days push you past it.</p>`}
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Drift over time</h2>
        ${chart(driftHistory())}
        <p class="tiny">Above the line = behind plan. Below = ahead.</p>
      </div>
      <div class="card">
        <h2>What's causing it</h2>
        ${tracks.length ? `<ul class="clean">${tracks.map(([t, mins]) => `<li class="row between"><span>${trackChip(t)} ${esc((track(t)?.name || t))}</span><span class="small">${(mins / 60).toFixed(1)} hrs behind · ${(mins / cap).toFixed(1)} days</span></li>`).join('')}</ul>`
          : '<p class="empty">Nothing overdue. Nothing is dragging you back.</p>'}
        <h3 style="margin-top:14px">How to get it back</h3>
        <ul class="small">
          ${nc ? `<li>Your next catch-up day is <strong>Day ${nc}</strong> (${fmtDate(projection(nc, { shift: 0 }).planned)}). About 4 hours of overdue work there removes about ${(240 / cap).toFixed(1)} days of drift.</li>` : ''}
          <li>A fully skipped day costs about <strong>1 day</strong>. Skipping one 45-minute task costs about ${(45 / cap).toFixed(2)} days.</li>
          <li>A Minimum Day keeps your streak, but your finish date still moves. Do it to protect the habit, not the deadline.</li>
          <li>Back after 3+ days away? Use <a href="#/settings">Re-plan</a>. Your history and the days you lost stay visible.</li>
        </ul>
      </div>
    </div>

    ${s.why ? `<div class="card"><h2>Why I'm doing this</h2><p style="white-space:pre-wrap">${esc(s.why)}</p></div>`
      : `<div class="card"><h2>Why are you doing this?</h2><p class="muted">Write your reason in <a href="#/settings">Settings</a>. It shows up here on hard days.</p></div>`}
  </div>`;
}
