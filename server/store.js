// Storage layer: MongoDB (via Mongoose) in production, or an in-memory store for local dev and tests.
// Both expose the same small async API, so the rest of the server doesn't care which one runs.
import mongoose from 'mongoose';
import crypto from 'node:crypto';

/* ---------- MongoDB ---------- */
function mongoStore() {
  const User = mongoose.model('User', new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: '' },
    passwordHash: { type: String, required: true },
  }, { timestamps: true }));

  const Plan = mongoose.model('Plan', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    active: { type: Boolean, default: true, index: true },
    plan: { type: Object, required: true },
  }, { timestamps: true, minimize: false }));

  const Progress = mongoose.model('Progress', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    data: { type: Object, default: {} },
  }, { timestamps: true, minimize: false }));

  const usageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    day: String,            // 'YYYY-MM-DD'
    generations: { type: Number, default: 0 },
  });
  usageSchema.index({ userId: 1, day: 1 }, { unique: true });
  const Usage = mongoose.model('Usage', usageSchema);

  const out = (doc) => doc && { ...doc, id: String(doc._id) };

  return {
    mode: 'mongodb',
    async connect(uri) { await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }); },
    async createUser({ email, name, passwordHash }) {
      const u = await User.create({ email, name, passwordHash });
      return out(u.toObject());
    },
    async findUserByEmail(email) { return out(await User.findOne({ email: email.toLowerCase() }).lean()); },
    async findUserById(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return out(await User.findById(id).lean());
    },
    async deleteUser(id) {
      await Promise.all([User.deleteOne({ _id: id }), Plan.deleteMany({ userId: id }), Progress.deleteOne({ userId: id }), Usage.deleteMany({ userId: id })]);
    },
    async getActivePlan(userId) {
      const p = await Plan.findOne({ userId, active: true }).sort({ createdAt: -1 }).lean();
      return p ? p.plan : null;
    },
    async saveActivePlan(userId, plan) {
      await Plan.updateMany({ userId, active: true }, { active: false });
      await Plan.create({ userId, plan, active: true });
    },
    async getProgress(userId) {
      const p = await Progress.findOne({ userId }).lean();
      return p ? { data: p.data, updatedAt: p.updatedAt } : null;
    },
    async saveProgress(userId, data) {
      const p = await Progress.findOneAndUpdate({ userId }, { data }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).lean();
      return { updatedAt: p.updatedAt };
    },
    async bumpGenerations(userId, day) {
      const u = await Usage.findOneAndUpdate({ userId, day }, { $inc: { generations: 1 } }, { upsert: true, returnDocument: 'after' }).lean();
      return u.generations;
    },
  };
}

/* ---------- In-memory (dev/tests) ---------- */
function memoryStore() {
  const users = new Map(); const plans = new Map(); const progress = new Map(); const usage = new Map();
  const clone = (x) => (x == null ? x : structuredClone(x));
  return {
    mode: 'memory',
    async connect() {},
    async createUser({ email, name, passwordHash }) {
      const e = email.toLowerCase();
      if ([...users.values()].some(u => u.email === e)) { const err = new Error('duplicate'); err.code = 11000; throw err; }
      const u = { id: crypto.randomUUID(), email: e, name, passwordHash, createdAt: new Date() };
      users.set(u.id, u); return clone(u);
    },
    async findUserByEmail(email) { return clone([...users.values()].find(u => u.email === email.toLowerCase()) || null); },
    async findUserById(id) { return clone(users.get(id) || null); },
    async deleteUser(id) { users.delete(id); plans.delete(id); progress.delete(id); },
    async getActivePlan(userId) { return clone(plans.get(userId) || null); },
    async saveActivePlan(userId, plan) { plans.set(userId, clone(plan)); },
    async getProgress(userId) { return clone(progress.get(userId) || null); },
    async saveProgress(userId, data) { const rec = { data: clone(data), updatedAt: new Date() }; progress.set(userId, rec); return { updatedAt: rec.updatedAt }; },
    async bumpGenerations(userId, day) { const k = `${userId}:${day}`; const n = (usage.get(k) || 0) + 1; usage.set(k, n); return n; },
  };
}

export async function createStore(uri) {
  if (!uri) return memoryStore();
  const s = mongoStore();
  await s.connect(uri);
  return s;
}
