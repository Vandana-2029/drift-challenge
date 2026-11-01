// Input validation for the questionnaire and for saved/imported plans.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-01');

export const BREAK_MODES = ['every-day', 'sun-catchup', 'sun-off', 'weekend-off'];
export const LEVELS = ['beginner', 'some', 'intermediate', 'advanced'];

export const answersSchema = z.object({
  title: z.string().trim().min(3, 'Give your challenge a short title').max(120),
  length: z.coerce.number().refine(n => [30, 60, 90].includes(n), 'Choose 30, 60 or 90 days'),
  startDate: isoDate,
  goals: z.object({
    d30: z.string().trim().min(3, 'Write at least your Day 30 goal').max(600),
    d60: z.string().trim().max(600).optional().default(''),
    d90: z.string().trim().max(600).optional().default(''),
  }),
  areas: z.array(z.string().trim().min(1).max(40)).min(1, 'Add at least one area').max(6, 'Use at most 6 areas'),
  level: z.enum(LEVELS).default('beginner'),
  hoursWeekday: z.coerce.number().min(0.5, 'At least 30 minutes a day').max(12),
  hoursWeekend: z.coerce.number().min(0).max(12),
  breakMode: z.enum(BREAK_MODES),
  typicalDay: z.string().trim().max(800).optional().default(''),
  deadline: z.object({
    date: isoDate.nullable().optional(),
    label: z.string().trim().max(80).optional().default(''),
  }).optional().default({ date: null, label: '' }),
  notes: z.string().trim().max(800).optional().default(''),
});

const task = z.looseObject({
  id: z.string().min(1).max(80),
  track: z.string().min(1).max(40),
  title: z.string().min(1).max(300),
  minutes: z.number().min(0).max(24 * 60),
  link: z.string().url().optional(),
});

const day = z.looseObject({
  day: z.number().int().min(1),
  type: z.enum(['normal', 'catchup', 'review', 'rest']),
  theme: z.string().max(200).optional().default(''),
  tasks: z.array(task).max(30),
});

export const planSchema = z.looseObject({
  meta: z.looseObject({
    title: z.string().min(1).max(160),
    startDate: isoDate,
    totalDays: z.number().int().min(7).max(366),
  }),
  tracks: z.array(z.looseObject({ id: z.string().min(1).max(40), name: z.string().min(1).max(60) })).min(1).max(12),
  phases: z.array(z.looseObject({ name: z.string(), startDay: z.number().int(), endDay: z.number().int() })).min(1),
  milestones: z.array(z.looseObject({
    id: z.string(), day: z.number().int(), title: z.string(),
    items: z.array(z.looseObject({ id: z.string(), text: z.string() })),
  })),
  days: z.array(day).min(7).max(366),
}).refine(p => p.days.length === p.meta.totalDays, 'The number of days must match meta.totalDays');
