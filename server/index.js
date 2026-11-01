// Drift Challenge server: serves the website and a small JSON API.
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, checkConfig } from './config.js';
import { createStore } from './store.js';
import { authRoutes, requireUser, publicUser, firstError } from './auth.js';
import { answersSchema, planSchema } from './schema.js';
import { generateOutline } from './ai.js';
import { buildPlan } from './planBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp({ store, log = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render sits behind a proxy
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    next();
  });

  /* ---------- API ---------- */
  const api = express.Router();
  const auth = requireUser(store);

  api.get('/health', (req, res) => res.json({ ok: true, storage: store.mode, ai: Boolean(config.groqKey) }));
  api.use('/auth', authRoutes(store));

  api.get('/me', auth, async (req, res) => {
    const plan = await store.getActivePlan(req.user.id);
    res.json({ user: publicUser(req.user), hasPlan: Boolean(plan), storage: store.mode });
  });

  api.post('/plan/generate', auth, async (req, res) => {
    const parsed = answersSchema.safeParse(req.body?.answers);
    if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
    const today = new Date().toISOString().slice(0, 10);
    const count = await store.bumpGenerations(req.user.id, today);
    if (count > config.plansPerDay) {
      return res.status(429).json({ error: `You've generated ${config.plansPerDay} plans today. Please pick one, or try again tomorrow.` });
    }
    const { outline, generator, note } = await generateOutline(parsed.data, log);
    const plan = buildPlan(parsed.data, outline, generator);
    res.json({ plan, note, usedAI: generator !== 'template', remainingToday: Math.max(0, config.plansPerDay - count) });
  });

  api.get('/plan', auth, async (req, res) => {
    res.json({ plan: await store.getActivePlan(req.user.id) });
  });

  api.post('/plan', auth, async (req, res) => {
    const parsed = planSchema.safeParse(req.body?.plan);
    if (!parsed.success) return res.status(400).json({ error: `This plan is not valid: ${firstError(parsed)}` });
    await store.saveActivePlan(req.user.id, parsed.data);
    if (req.body?.resetProgress) await store.saveProgress(req.user.id, { startDate: parsed.data.meta.startDate });
    res.json({ ok: true });
  });

  api.get('/progress', auth, async (req, res) => {
    const p = await store.getProgress(req.user.id);
    res.json(p || { data: null, updatedAt: null });
  });

  api.put('/progress', auth, async (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Missing progress data' });
    res.json(await store.saveProgress(req.user.id, data));
  });

  api.delete('/account', auth, async (req, res) => {
    await store.deleteUser(req.user.id);
    res.clearCookie('drift_session', { path: '/' });
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  /* ---------- website ---------- */
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));

  // errors
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    log.error('[error]', err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' });
    res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });

  return app;
}

// start when run directly (not when imported by tests)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkConfig();
  const store = await createStore(config.mongoUri);
  const app = await createApp({ store });
  app.listen(config.port, () => console.log(`Drift Challenge running on http://localhost:${config.port} (storage: ${store.mode})`));
}
