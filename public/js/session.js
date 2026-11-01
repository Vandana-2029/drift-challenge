// The logged-in user (set after /api/me).
let USER = null;
export function setUser(u) { USER = u; }
export function user() { return USER; }
export function firstName() { return (USER?.name || '').trim().split(/\s+/)[0] || 'there'; }
