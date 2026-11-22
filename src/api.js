export const tok = {
  get: () => localStorage.getItem('ll_token'),
  set: t => localStorage.setItem('ll_token', t),
  clear: () => { localStorage.removeItem('ll_token'); localStorage.removeItem('ll_user') },
}
export async function api(path, method = 'GET', body) {
  let r
  try {
    r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(tok.get() ? { Authorization: 'Bearer ' + tok.get() } : {}) }, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error('Could not reach Ledgerline’s server. Please check your connection and try again.')
  }
  const type = r.headers.get('content-type') || '', j = type.includes('application/json') ? await r.json().catch(() => ({})) : {}
  if (!type.includes('application/json')) throw new Error('The API returned a webpage instead of data. The production backend is not connected correctly.')
  if (!r.ok) {
    if (r.status === 401 && tok.get()) { tok.clear(); location.reload() }
    throw new Error(j.error || (r.status === 404 ? 'The production API is unavailable. The administrator needs to connect the backend deployment.' : `Request failed (${r.status}). Please try again.`))
  }
  return j
}
