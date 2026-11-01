import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, templateOutline, dayType } from '../server/planBuilder.js';
import { answersSchema, planSchema } from '../server/schema.js';

const base = {
  title: 'Get job-ready as a web developer', length: 90, startDate: '2026-11-02', // a Monday
  goals: { d30: 'Finish JS + React basics', d60: 'Deploy a MERN app', d90: 'Apply to 100 jobs' },
  areas: ['DSA', 'React', 'English speaking'], level: 'beginner',
  hoursWeekday: 4, hoursWeekend: 2, breakMode: 'sun-off', typicalDay: '', notes: '',
};
const answers = (over = {}) => answersSchema.parse({ ...base, ...over });

test('answers schema fills defaults and rejects bad input', () => {
  const a = answers();
  assert.equal(a.deadline.date ?? null, null);
  assert.equal(answersSchema.safeParse({ ...base, length: 45 }).success, false);
  assert.equal(answersSchema.safeParse({ ...base, areas: [] }).success, false);
});

test('builds a valid 90-day plan with the right number of days and phases', () => {
  const a = answers();
  const plan = buildPlan(a, templateOutline(a));
  assert.equal(plan.days.length, 90);
  assert.equal(plan.phases.length, 3);
  assert.equal(plan.milestones.length, 3);
  assert.equal(plan.meta.endDate, '2027-01-30');
  assert.ok(planSchema.safeParse(plan).success, 'plan passes schema');
});

test('sun-off makes every Sunday a rest day with no tasks', () => {
  const a = answers({ breakMode: 'sun-off' });
  const plan = buildPlan(a, templateOutline(a));
  const sundays = plan.days.filter(d => new Date(d.date + 'T00:00:00Z').getUTCDay() === 0 && d.day % 30 !== 0);
  assert.ok(sundays.length >= 12);
  assert.ok(sundays.every(d => d.type === 'rest' && d.tasks.length === 0));
});

test('weekend-off rests Saturday and Sunday; every-day uses every 7th day as catch-up', () => {
  const a1 = answers({ breakMode: 'weekend-off' });
  const p1 = buildPlan(a1, templateOutline(a1));
  assert.equal(p1.days[5].type, 'rest'); // day 6 = Saturday
  const a2 = answers({ breakMode: 'every-day' });
  const p2 = buildPlan(a2, templateOutline(a2));
  assert.equal(p2.days[6].type, 'catchup');
  assert.equal(p2.days[29].type, 'review');
  assert.equal(dayType(14, '2026-11-15', 'every-day', 90), 'catchup');
});

test('daily minutes roughly match the hours available', () => {
  const a = answers({ hoursWeekday: 3, breakMode: 'weekend-off' });
  const plan = buildPlan(a, templateOutline(a));
  const weekday = plan.days.find(d => d.type === 'normal');
  const total = weekday.tasks.reduce((s, t) => s + t.minutes, 0);
  assert.ok(total >= 160 && total <= 200, `got ${total}`);
});

test('small time budgets rotate through tracks instead of cramming all of them', () => {
  const a = answers({ hoursWeekday: 1, hoursWeekend: 1, breakMode: 'every-day' });
  const plan = buildPlan(a, templateOutline(a));
  const normal = plan.days.filter(d => d.type === 'normal').slice(0, 6);
  assert.ok(normal.every(d => d.tasks.length === 1));
  const tracksSeen = new Set(normal.map(d => d.tasks[0].track));
  assert.equal(tracksSeen.size, 3);
});

test('uses AI outline task ideas and maps track names', () => {
  const a = answers({ length: 30 });
  const outline = templateOutline(a);
  outline.weeks[0].tasks = [{ track: 'react', title: 'Build a counter with useState' }, { track: 'DSA', title: 'LeetCode 1: Two Sum' }];
  const plan = buildPlan(a, outline, 'groq:test');
  const titles = plan.days.slice(0, 6).flatMap(d => d.tasks.map(t => t.title));
  assert.ok(titles.includes('Build a counter with useState'));
  assert.ok(titles.includes('LeetCode 1: Two Sum'));
  assert.equal(plan.meta.generator, 'groq:test');
  const ids = plan.days.flatMap(d => d.tasks.map(t => t.id));
  assert.equal(new Set(ids).size, ids.length, 'task ids are unique');
});
