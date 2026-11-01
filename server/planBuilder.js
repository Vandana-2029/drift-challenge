// Turns questionnaire answers + an outline (from the AI, or the offline template) into the full plan:
// one entry per day with tasks that fit the person's hours and break days.
// Keeping this step in code (not in the AI) means hours, rest days and dates are always exactly right.

const PALETTE = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#ca8a04', '#db2777', '#0891b2', '#64748b'];
const DAY_MS = 86400000;

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return dt.toISOString().slice(0, 10);
}
const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export function slugId(name, used) {
  let base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'TRACK';
  let id = base, i = 2;
  while (used.has(id)) id = `${base}${i++}`;
  used.add(id);
  return id;
}

/** Day type for a calendar position, given the break mode. */
export function dayType(dayNum, iso, breakMode, totalDays) {
  if (dayNum % 30 === 0 && dayNum <= totalDays) return 'review';
  const wd = weekday(iso);
  switch (breakMode) {
    case 'sun-off': return wd === 0 ? 'rest' : 'normal';
    case 'weekend-off': return wd === 0 || wd === 6 ? 'rest' : 'normal';
    case 'sun-catchup': return wd === 0 ? 'catchup' : 'normal';
    default: return dayNum % 7 === 0 ? 'catchup' : 'normal'; // every-day: every 7th day is catch-up
  }
}

/** Offline outline used when there's no AI key, or the AI call fails. */
export function templateOutline(a) {
  const phaseNames = a.length === 30 ? ['Sprint'] : a.length === 60 ? ['Foundation', 'Build & prove'] : ['Foundation', 'Build', 'Polish & prove'];
  const goals = [a.goals.d30, a.goals.d60, a.goals.d90];
  const weeks = Math.ceil(a.length / 7);
  return {
    title: a.title,
    summary: `A ${a.length}-day plan for: ${a.title}.`,
    tracks: a.areas.map(name => ({ name, weight: 3 })),
    phases: phaseNames.map((name, i) => ({ name, goal: goals[i] || goals[0] })),
    milestones: phaseNames.map((name, i) => ({
      title: name,
      items: [{ text: goals[i] || goals[0], track: 'ALL' }, ...a.areas.map(t => ({ text: `Steady weekly progress in ${t}`, track: t }))],
    })),
    minimumDay: ['One small task from today (15 minutes)', '30 minutes on your most important area', '5 minutes writing what you did'],
    weeks: Array.from({ length: weeks }, (_, w) => {
      const p = phaseNames[Math.min(phaseNames.length - 1, Math.floor((w * 7) / 30))];
      return {
        focus: `Week ${w + 1}: ${p}`,
        tasks: a.areas.flatMap(t => [
          { track: t, title: `Learn: the next topic in ${t}`, minutes: 45 },
          { track: t, title: `Practice: exercises on this week's ${t} topic`, minutes: 45 },
          { track: t, title: `Apply: use ${t} in a small piece of real work`, minutes: 45 },
          { track: t, title: `Review: write short notes on what you learned in ${t} this week`, minutes: 45 },
          { track: t, title: `Test yourself: a timed exercise or quiz on ${t}`, minutes: 45 },
        ]),
      };
    }),
  };
}

/**
 * Build the full plan.
 * @param {object} a  validated answers
 * @param {object} outline  { title, summary, tracks[{name,weight}], phases[{name,goal}], milestones[{title,items[{text,track}]}], minimumDay[], weeks[{focus,tasks[{track,title,minutes}]}] }
 * @param {string} generator  e.g. 'groq:openai/gpt-oss-120b' or 'template'
 */
export function buildPlan(a, outline, generator = 'template') {
  const N = a.length;
  const nPhases = N / 30;

  // ---- tracks ----
  const used = new Set();
  const srcTracks = (outline.tracks?.length ? outline.tracks : a.areas.map(n => ({ name: n, weight: 3 }))).slice(0, 6);
  const tracks = srcTracks.map((t, i) => ({
    id: slugId(String(t.name), used),
    name: String(t.name).slice(0, 40),
    weight: Math.min(5, Math.max(1, Number(t.weight) || 3)),
    color: PALETTE[i % PALETTE.length],
  }));
  const trackByName = (name) => {
    const n = String(name || '').toLowerCase();
    return tracks.find(t => t.name.toLowerCase() === n) || tracks.find(t => n.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(n)) || null;
  };

  // ---- weekly idea pools per track ----
  const weeks = Math.ceil(N / 7);
  const pools = Array.from({ length: weeks }, (_, w) => {
    const wk = outline.weeks?.[w] || outline.weeks?.[outline.weeks.length - 1];
    const byTrack = Object.fromEntries(tracks.map(t => [t.id, []]));
    for (const task of wk?.tasks || []) {
      const t = trackByName(task.track) || tracks[0];
      if (task.title) byTrack[t.id].push(String(task.title).slice(0, 200));
    }
    for (const t of tracks) if (!byTrack[t.id].length) byTrack[t.id].push(`Work on ${t.name}: next topic`, `Practice ${t.name}`);
    return { focus: String(wk?.focus || `Week ${w + 1}`).slice(0, 120), byTrack, cursor: Object.fromEntries(tracks.map(t => [t.id, 0])) };
  });

  // ---- days ----
  const days = [];
  let rotate = 0;
  for (let d = 1; d <= N; d++) {
    const iso = addDays(a.startDate, d - 1);
    const wd = weekday(iso);
    const isWeekend = wd === 0 || wd === 6;
    const type = dayType(d, iso, a.breakMode, N);
    const week = pools[Math.ceil(d / 7) - 1];
    const hours = isWeekend ? a.hoursWeekend : a.hoursWeekday;
    const budget = Math.max(30, Math.round(hours * 60));
    const pad = String(d).padStart(2, '0');
    const tasks = [];

    if (type === 'rest') {
      days.push({ day: d, date: iso, type, theme: 'Rest day', tasks });
      continue;
    }
    if (type === 'catchup') {
      tasks.push({ id: `d${pad}-catchup-1`, track: tracks[0].id, title: 'Catch-up: finish anything left from this week (if nothing is left, revise the hardest topic)', minutes: Math.min(budget, 120) });
      tasks.push({ id: `d${pad}-catchup-2`, track: tracks[0].id, title: 'Weekly review: write what worked, what didn\'t, and one change for next week', minutes: 20 });
      days.push({ day: d, date: iso, type, theme: 'Catch-up day', tasks });
      continue;
    }
    if (type === 'review') {
      tasks.push({ id: `d${pad}-review-1`, track: tracks[0].id, title: `Open Big Goals and tick off your Day ${d} checklist`, minutes: 30 });
      tasks.push({ id: `d${pad}-review-2`, track: tracks[0].id, title: 'Write a short reflection: what to keep, what to cut, targets for the next 30 days', minutes: 30 });
      days.push({ day: d, date: iso, type, theme: `Day ${d} milestone review`, tasks });
      continue;
    }

    // normal day: pick tracks that fit the time budget (about 45 min minimum each), rotating fairly
    const k = Math.max(1, Math.min(tracks.length, Math.floor(budget / 45)));
    const chosen = [];
    for (let i = 0; i < k; i++) chosen.push(tracks[(rotate + i) % tracks.length]);
    rotate = (rotate + (k < tracks.length ? k : 0)) % tracks.length;
    const wsum = chosen.reduce((s, t) => s + t.weight, 0);
    chosen.forEach((t, i) => {
      const pool = week.byTrack[t.id];
      const idx = week.cursor[t.id]++;
      const base = pool[idx % pool.length];
      const title = idx >= pool.length ? `Revise: ${base.replace(/^[A-Za-z ]{2,20}:\s*/, '')}` : base;
      tasks.push({ id: `d${pad}-${t.id.toLowerCase()}-${i + 1}`, track: t.id, title, minutes: round5((budget * t.weight) / wsum) });
    });
    days.push({ day: d, date: iso, type, theme: week.focus, tasks });
  }

  // ---- phases + milestones ----
  const phases = Array.from({ length: nPhases }, (_, i) => ({
    id: i + 1,
    name: String(outline.phases?.[i]?.name || `Phase ${i + 1}`).slice(0, 60),
    startDay: i * 30 + 1,
    endDay: (i + 1) * 30,
    goal: String(outline.phases?.[i]?.goal || [a.goals.d30, a.goals.d60, a.goals.d90][i] || '').slice(0, 400),
  }));
  const studyDaysUpTo = (n) => days.slice(0, n).filter(x => x.type !== 'rest').length;
  const milestones = phases.map((p, i) => {
    const m = outline.milestones?.[i];
    const items = (m?.items || []).slice(0, 8).map((it, j) => {
      const t = trackByName(it.track);
      return { id: `m${p.endDay}-${j + 1}`, text: String(it.text).slice(0, 200), track: t ? t.id : 'ALL', done: false };
    });
    items.push({ id: `m${p.endDay}-show`, text: `Showed up on 75%+ of study days (${Math.round(studyDaysUpTo(p.endDay) * 0.75)} days)`, track: 'ALL', metric: 'daysShowedUp', target: Math.round(studyDaysUpTo(p.endDay) * 0.75), done: false });
    return { id: `m${p.endDay}`, day: p.endDay, date: addDays(a.startDate, p.endDay - 1), phase: p.id, title: `Day ${p.endDay}: ${String(m?.title || p.name).slice(0, 80)}`, passRule: 'About 70% of items done = pass', items };
  });

  return {
    meta: {
      title: String(outline.title || a.title).slice(0, 120),
      summary: String(outline.summary || '').slice(0, 600),
      startDate: a.startDate,
      endDate: addDays(a.startDate, N - 1),
      totalDays: N,
      version: 2,
      generator,
      createdAt: new Date().toISOString(),
      deadline: a.deadline?.date ? { date: a.deadline.date, label: a.deadline.label || 'Deadline' } : null,
      minimumDay: (outline.minimumDay?.length ? outline.minimumDay : templateOutline(a).minimumDay).slice(0, 4).map(s => String(s).slice(0, 120)),
      hours: { weekday: a.hoursWeekday, weekend: a.hoursWeekend },
      breakMode: a.breakMode,
      answers: a,
    },
    rules: [
      'Never zero: a Minimum Day still counts as showing up',
      'Never double up: missed work goes to the next catch-up day',
      'Away 3+ days? Re-plan and continue; don\'t restart from Day 1',
      'Milestone review days: cut scope, not sleep',
    ],
    tracks,
    phases,
    milestones,
    days,
  };
}
