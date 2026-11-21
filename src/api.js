export const tok = {
  get: () => localStorage.getItem('ll_token'),
  set: t => localStorage.setItem('ll_token', t),
  clear: () => { localStorage.removeItem('ll_token'); localStorage.removeItem('ll_user') },
}
export async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(tok.get() ? { Authorization: 'Bearer ' + tok.get() } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { if (r.status === 401 && tok.get()) { tok.clear(); location.reload() } throw new Error(j.error || 'Something went wrong. Try again.') }
  return j
}
