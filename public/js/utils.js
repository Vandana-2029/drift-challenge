// Small helpers shared by every view.

const MS_DAY = 86400000;

/** Parse 'YYYY-MM-DD' as a local date (not UTC), so dates never shift by a day. */
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as local 'YYYY-MM-DD'. */
export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from a to b (both ISO strings). */
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / MS_DAY);
}

/**
 * Today's date as ISO. Add ?today=2026-11-20 to the URL to pretend it is another day
 * (handy for testing how the drift looks). Without it, the real local date is used.
 */
export function todayISO() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return toISO(new Date());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'Sun 1 Nov' style label. */
export function fmtDate(iso, { weekday = true, year = false } = {}) {
  const d = parseISO(iso);
  let s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (weekday) s = `${WEEKDAYS[d.getDay()]} ${s}`;
  if (year) s += ` ${d.getFullYear()}`;
  return s;
}

/** Escape text before putting it into innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function pct(n, d) {
  return d ? Math.round((n / d) * 100) : 0;
}

export function plural(n, word, many = word + 's') {
  return `${n} ${n === 1 ? word : many}`;
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
