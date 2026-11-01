import crypto from 'node:crypto';

// All settings come from environment variables (set them in Render → Environment).
export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  // never fall back to a known secret in production: a random one just logs everyone out on restart
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? crypto.randomBytes(32).toString('hex') : 'dev-only-secret-change-me'),
  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  // how many AI plans one account may generate per day (protects the free API quota)
  plansPerDay: Number(process.env.PLANS_PER_DAY) || 5,
  isProd: process.env.NODE_ENV === 'production',
};

export function checkConfig(log = console) {
  if (!config.mongoUri) log.warn('[config] MONGODB_URI not set: using in-memory storage. Data is lost when the server restarts.');
  if (!config.groqKey) log.warn('[config] GROQ_API_KEY not set: plans are built with the offline template instead of AI.');
  if (config.isProd && !process.env.JWT_SECRET) log.warn('[config] JWT_SECRET not set: using a random secret, so everyone is logged out when the server restarts.');
}
