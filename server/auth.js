// Email + password accounts. Passwords are hashed with bcrypt; the session is a signed JWT in an httpOnly cookie.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';

const COOKIE = 'drift_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(60),
  email: z.string().trim().toLowerCase().email('Please enter a valid email').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: z.string().min(1, 'Please enter your password'),
});

function setSession(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: MAX_AGE_MS, path: '/' });
}

export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

export function firstError(result) {
  return result.error.issues[0]?.message || 'Invalid input';
}

/** Middleware: attaches req.user or responds 401. */
export function requireUser(store) {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.[COOKIE];
      if (!token) return res.status(401).json({ error: 'Please log in' });
      const { sub } = jwt.verify(token, config.jwtSecret);
      const user = await store.findUserById(sub);
      if (!user) return res.status(401).json({ error: 'Please log in' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Your session expired. Please log in again.' });
    }
  };
}

export function authRoutes(store) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

  r.post('/signup', limiter, async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
    const { name, email, password } = parsed.data;
    if (await store.findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
    try {
      const user = await store.createUser({ name, email, passwordHash: await bcrypt.hash(password, 10) });
      setSession(res, user.id);
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
      throw err;
    }
  });

  r.post('/login', limiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
    const user = await store.findUserByEmail(parsed.data.email);
    const ok = user && await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Wrong email or password' });
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  r.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return r;
}
