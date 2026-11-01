// Asks Groq for a plan outline (tracks, phases, milestones, weekly task ideas) as strict JSON.
// The server then turns the outline into exact daily tasks (see planBuilder.js).
import { config } from './config.js';
import { templateOutline } from './planBuilder.js';

const str = { type: 'string' };
const OUTLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'tracks', 'phases', 'milestones', 'minimumDay', 'weeks'],
  properties: {
    title: str,
    summary: str,
    tracks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'weight'], properties: { name: str, weight: { type: 'integer' } } } },
    phases: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'goal'], properties: { name: str, goal: str } } },
    milestones: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'items'],
        properties: { title: str, items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'track'], properties: { text: str, track: str } } } },
      },
    },
    minimumDay: { type: 'array', items: str },
    weeks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['focus', 'tasks'],
        properties: { focus: str, tasks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['track', 'title'], properties: { track: str, title: str } } } },
      },
    },
  },
};

const LEVEL_TEXT = { beginner: 'a complete beginner', some: 'someone with a little experience', intermediate: 'an intermediate learner', advanced: 'an advanced learner' };
const BREAK_TEXT = {
  'every-day': 'works every day; every 7th day is a catch-up day',
  'sun-catchup': 'uses Sunday as a catch-up day (no new topics)',
  'sun-off': 'rests on Sundays',
  'weekend-off': 'rests on Saturdays and Sundays',
};

export function buildPrompt(a) {
  const weeks = Math.ceil(a.length / 7);
  const phases = a.length / 30;
  const ideas = a.areas.length <= 3 ? 4 : 3;
  const system = [
    'You are an expert coach who designs realistic 30/60/90-day learning and career challenges.',
    'Return ONLY JSON matching the given schema. Write in plain, simple English.',
    'Rules:',
    `- "tracks": exactly the person's areas (keep their names, max 6). "weight" 1-5 = how much time it deserves.`,
    `- "phases": exactly ${phases} item(s), one per 30 days, each tied to that period's goal.`,
    `- "milestones": exactly ${phases} item(s), one per phase, each with 4-6 measurable checklist items (numbers where possible). "track" must be one of the track names or "ALL".`,
    `- "minimumDay": exactly 3 tiny actions for a bad day (about 1 hour total).`,
    `- "weeks": exactly ${weeks} items in order. Each has a short "focus" and ${ideas} concrete task ideas PER TRACK, progressing in difficulty week by week.`,
    '- Task titles must be specific and actionable (e.g. "LeetCode 206: Reverse Linked List", "Build a to-do app with React useState"), under 90 characters.',
    '- Respect the hours: tasks should fit the daily time available. Do not invent personal facts.',
  ].join('\n');
  const user = [
    `Challenge: ${a.title}`,
    `Length: ${a.length} days, starting ${a.startDate}. The person ${BREAK_TEXT[a.breakMode]}.`,
    `Level: ${LEVEL_TEXT[a.level] || a.level}.`,
    `Time: ${a.hoursWeekday} h on weekdays, ${a.hoursWeekend} h on weekends.`,
    `Areas: ${a.areas.join(', ')}.`,
    `Goal by Day 30: ${a.goals.d30}`,
    a.length >= 60 ? `Goal by Day 60: ${a.goals.d60 || '(not given: continue sensibly)'}` : '',
    a.length >= 90 ? `Goal by Day 90: ${a.goals.d90 || '(not given: continue sensibly)'}` : '',
    a.typicalDay ? `Their typical day: ${a.typicalDay}` : '',
    a.deadline?.date ? `Important deadline: ${a.deadline.label || 'deadline'} on ${a.deadline.date}.` : '',
    a.notes ? `Other notes: ${a.notes}` : '',
  ].filter(Boolean).join('\n');
  return { system, user };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGroq(body, { retries = 1 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${config.groqBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status === 429 && retries > 0) {
      const wait = Math.min(30, Number(res.headers.get('retry-after')) || 10);
      await sleep(wait * 1000);
      return callGroq(body, { retries: retries - 1 });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error?.message || `Groq error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns { outline, generator, note }. Never throws for AI problems: falls back to the template outline.
 */
export async function generateOutline(a, log = console) {
  if (!config.groqKey) {
    return { outline: templateOutline(a), generator: 'template', note: 'AI is not set up on this server yet, so this plan uses the built-in template.' };
  }
  const { system, user } = buildPrompt(a);
  const body = {
    model: config.groqModel,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: { name: 'challenge_outline', strict: true, schema: OUTLINE_SCHEMA } },
    temperature: 0.5,
    max_completion_tokens: 7000,
    reasoning_effort: 'low',
  };
  try {
    let json;
    try {
      json = await callGroq(body);
    } catch (err) {
      // some models don't accept reasoning_effort: retry once without it
      if (err.status === 400 && /reasoning/i.test(err.message)) {
        delete body.reasoning_effort;
        json = await callGroq(body);
      } else throw err;
    }
    const content = json.choices?.[0]?.message?.content;
    const outline = JSON.parse(content);
    if (!Array.isArray(outline.weeks) || !outline.weeks.length) throw new Error('AI returned no weeks');
    return { outline, generator: `groq:${config.groqModel}`, note: '' };
  } catch (err) {
    log.error('[ai] falling back to template:', err.message);
    const busy = err.status === 429;
    return {
      outline: templateOutline(a),
      generator: 'template',
      note: busy ? 'The AI is busy right now (free limit reached), so this plan uses the built-in template. Try "Regenerate" in a minute.'
                 : 'The AI could not build a plan this time, so this plan uses the built-in template. You can try "Regenerate".',
    };
  }
}
